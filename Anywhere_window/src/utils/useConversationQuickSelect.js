import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { formatConversationReference } from "../../../shared/conversationReference.js";

// This catalog stays in the renderer. Only the user's chosen reference is inserted.
export function useConversationQuickSelect({
  prompt,
  senderRef,
  getDirectory,
  isLocked,
}) {
  const visible = ref(false);
  const keyword = ref("");
  const highlighted = ref(0);
  const loading = ref(false);
  const error = ref("");
  const catalog = ref([]);
  let activeRange = null;
  let directory = "";
  let requestId = 0;
  let composing = false;
  let disposed = false;
  let inserting = false;

  const items = computed(() => {
    const terms = keyword.value
      .trim()
      .toLocaleLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    return catalog.value
      .filter((item) => {
        const haystack = [item.title, ...(item.projectNames || [])]
          .join(" ")
          .toLocaleLowerCase();
        return terms.every((term) => haystack.includes(term));
      })
      .slice(0, 10);
  });
  const close = () => {
    visible.value = false;
    activeRange = null;
  };
  const readRange = () => {
    const textarea = senderRef.value?.$refs.textarea;
    if (!textarea || textarea.selectionStart !== textarea.selectionEnd)
      return null;
    const text = String(prompt.value || "");
    const end = textarea.selectionStart;
    if (end === 0) return null;
    const start = text.lastIndexOf("\n", end - 1) + 1;
    const segment = text.slice(start, end);
    if (!segment.startsWith(">") || segment.startsWith(">>")) return null;
    // References/other Markdown on this line end the quick selector.
    if (/[\r\n<>]/.test(segment.slice(1)) || segment.slice(1).includes('[') || segment.slice(1).includes(']')) return null;
    return { start, end, keyword: segment.slice(1) };
  };
  const refresh = async () => {
    const currentDirectory = String(getDirectory() || "");
    const token = ++requestId;
    directory = currentDirectory;
    catalog.value = [];
    error.value = "";
    if (!currentDirectory) {
      loading.value = false;
      return;
    }
    loading.value = true;
    try {
      const rows =
        await window.api.listConversationReferences(currentDirectory);
      if (
        disposed ||
        token !== requestId ||
        currentDirectory !== String(getDirectory() || "")
      )
        return;
      catalog.value = Array.isArray(rows) ? rows : [];
    } catch {
      if (!disposed && token === requestId)
        error.value = "读取本地会话失败，请关闭后重试";
    } finally {
      if (token === requestId) loading.value = false;
    }
  };
  const sync = () => {
    if (disposed || inserting || composing || isLocked()) {
      close();
      return;
    }
    const range = readRange();
    if (!range) {
      close();
      return;
    }
    const opening =
      !visible.value || directory !== String(getDirectory() || "");
    if (
      !activeRange ||
      range.keyword !== activeRange.keyword ||
      range.start !== activeRange.start
    )
      highlighted.value = 0;
    activeRange = range;
    keyword.value = range.keyword;
    visible.value = true;
    if (opening) void refresh();
  };
  const choose = async (item) => {
    const range = readRange();
    if (
      !visible.value ||
      isLocked() ||
      composing ||
      !range ||
      !activeRange ||
      range.start !== activeRange.start ||
      range.end !== activeRange.end ||
      range.keyword !== activeRange.keyword ||
      directory !== String(getDirectory() || "")
    ) {
      close();
      return;
    }
    const reference = formatConversationReference(
      item?.title,
      item?.conversationId,
    );
    if (!reference) return;
    const text = String(prompt.value || "");
    const insertion = reference + " ";
    inserting = true;
    prompt.value =
      text.slice(0, range.start) + insertion + text.slice(range.end);
    close();
    try {
      await nextTick();
      const textarea = senderRef.value?.$refs.textarea;
      textarea?.focus();
      textarea?.setSelectionRange(
        range.start + insertion.length,
        range.start + insertion.length,
      );
    } finally {
      inserting = false;
    }
  };
  const keydown = (event) => {
    if (!visible.value || composing || event.isComposing) return false;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return true;
    }
    if (["ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      if (items.value.length) {
        highlighted.value =
          (highlighted.value +
            (event.key === "ArrowUp" ? -1 : 1) +
            items.value.length) %
          items.value.length;
        nextTick(() =>
          senderRef.value?.$el
            ?.closest(".chat-input-area-vertical")
            ?.querySelector(".conversation-quick-item.highlighted")
            ?.scrollIntoView({ block: "nearest" }),
        );
      }
      return true;
    }
    if (event.key === "Tab" || event.key === "Enter") {
      // Never turn a selector-confirm key into an accidental model submission.
      event.preventDefault();
      event.stopPropagation();
      if (items.value[highlighted.value])
        void choose(items.value[highlighted.value]);
      return true;
    }
    return false;
  };
  const onKeyUp = (event) => {
    if (!["Escape", "Tab", "Enter", "ArrowUp", "ArrowDown"].includes(event.key))
      sync();
  };
  const onCompositionStart = () => {
    composing = true;
    close();
  };
  const onCompositionEnd = () => {
    composing = false;
    nextTick(sync);
  };
  watch(prompt, () => nextTick(sync));
  watch(
    () => String(getDirectory() || ""),
    () => {
      requestId++;
      catalog.value = [];
      close();
    },
  );
  watch(
    () => isLocked(),
    (locked) => {
      if (locked) close();
    },
  );
  onBeforeUnmount(() => {
    disposed = true;
    requestId++;
    close();
  });
  return {
    visible,
    items,
    highlighted,
    loading,
    error,
    sync,
    close,
    choose,
    keydown,
    onKeyUp,
    onCompositionStart,
    onCompositionEnd,
  };
}
