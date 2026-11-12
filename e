[33mcommit f45e460b9f68385e4dd9d127bbf9829e6019fdcc[m[33m ([m[1;36mHEAD[m[33m -> [m[1;32mmain[m[33m)[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Nov 3 17:40:41 2026 +0800

    refactor(ui): rename quick assistants to agents

[33mcommit 18de273db3602c1919aa88190ff3487fe60aa273[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Nov 1 17:10:12 2026 +0800

    fix(config): ignore desktop usage statistics on plugin import

[33mcommit 56bc5ba3fed681a53f8869a625512844baafa712[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Oct 29 19:07:46 2026 +0800

    fix(web-fetch): enforce 200 MB limit and shorten tool description

[33mcommit fbd45dbc3cfb3995e6333d7ba3bb3c6dbecdbc1e[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Oct 29 04:42:42 2026 +0800

    feat(web-fetch): download file responses to system Downloads

[33mcommit 78e572567af71cc4cdca8568c9b401e50b60ca58[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Oct 28 21:21:01 2026 +0800

    fix(conversation): preserve paged links and recover safe deletion
    
    Include the existing removal of unused logo assets.

[33mcommit f7c25c5e072988fee5a71fe7b696ac5e24be5ba2[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Oct 28 20:06:19 2026 +0800

    fix(view-image): optimize images before adding model context

[33mcommit c63d1fa647a67e6353c7c50fd10db90c2eb7ea54[m[33m ([m[1;31morigin/main[m[33m)[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Oct 26 20:34:28 2026 +0800

    fix: remove extra sub-agent generation deadline

[33mcommit 9ba3410b364eae33bb699b50a1256248a0c2a8aa[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Oct 26 20:17:10 2026 +0800

    fix: recover leases and deliver agent notices between tool rounds

[33mcommit 5500cc188b998cd69a997135c4d853c93cd551b8[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Oct 20 19:08:42 2026 +0800

    fix: persist inserted compaction checkpoints

[33mcommit 853adb6f86e8c34436276fab6cf7754005b243a4[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Oct 18 02:16:57 2026 +0800

    feat: add reasoning depth selector

[33mcommit b59f6a00f6efbda5a9bc2238dd724b0f8bb259a6[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Oct 18 01:32:20 2026 +0800

    perf: dedupe preload runtime bundle

[33mcommit 2e818def867ac47742f0ca2a6d37635644aaccd7[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Oct 17 23:53:24 2026 +0800

    feat: unify uTools 7 and 8 runtime support

[33mcommit dad78af2954dd68c651e002c401923ae792088a2[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Oct 16 16:09:37 2026 +0800

    fix: queue super agent messages

[33mcommit 665463f69005d1991d61b8e6dbdb42759bf8fb1f[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Oct 15 13:57:33 2026 +0800

    fix: link new user messages before persistence

[33mcommit 6b158caa4657e9e25619832252aaa19f373050fe[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Oct 15 01:25:41 2026 +0800

    perf: speed up concurrent history uploads

[33mcommit 5889de7caddf400efd577514e462f3653ebd41c7[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Oct 14 23:03:51 2026 +0800

    fix: allow verified tool call turn deletion

[33mcommit acd4694b38025e6bb00d81191b33732c9dbd7676[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Oct 14 22:35:09 2026 +0800

    fix: stabilize concurrent history sync

[33mcommit 4909866b490eb976768a2707a03584f0ee2719ab[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Oct 14 19:20:40 2026 +0800

    fix: calibrate multimodal token estimates

[33mcommit 5fa116f58bfeaed8b201a2e3288918366435f69e[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Oct 14 18:48:08 2026 +0800

    perf: trim compaction runtime payload

[33mcommit 4515935e156ff1e79a1c9177384e6fc6bc506421[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Oct 14 17:57:29 2026 +0800

    fix: harden multimodal conversation runtime

[33mcommit 115957dedc9ef743e4711dd51efaf34e13283fd3[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Oct 14 14:32:14 2026 +0800

    fix: rebuild conversation index from sqlite

[33mcommit c759472853b1037a657329047799deb161a148af[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Oct 13 20:51:44 2026 +0800

    fix: guard stale conversation ui links

[33mcommit cf2ce66cd42f788d5ba175ccf2ae604b7a72f224[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Oct 13 16:22:33 2026 +0800

    fix: preserve edited conversation snapshots

[33mcommit 1791c9b83c35ce3101a6a4c899ce15277a12a817[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Oct 13 15:00:07 2026 +0800

    fix: make conversation persistence durable

[33mcommit fe8d92f9557665469b82b31d9a9c6a9684154d5e[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Oct 12 15:50:55 2026 +0800

    fix: prevent markdown placeholder expansion

[33mcommit 905d680909d650fafcd4c65067aea520c7034592[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Oct 10 01:44:18 2026 +0800

    fix: preserve RPC request for conversation lease

[33mcommit 353dd2a1c9ff05659833ac2b7b898d9a1f616022[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Oct 10 01:26:37 2026 +0800

    chore: ignore local project agent guidance

[33mcommit 729b4972dfda199b7c768c285255d9bd1b95d500[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Oct 10 01:06:32 2026 +0800

    chore: prepare stable uTools release

[33mcommit 7517ae0cbf44c9a0284b4656f8ee236f88648465[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Oct 9 23:48:31 2026 +0800

    fix: replace helper fork IPC with JSONL

[33mcommit 984230d3e2859093a0dc9b3d8c634332b80f084a[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Oct 9 23:17:44 2026 +0800

    fix: move all conversation storage to helper

[33mcommit bf2c808c17551fe1b999f1672a30cd57eed2ecb7[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Oct 9 20:31:36 2026 +0800

    fix: isolate and trace plugin conversation snapshots

[33mcommit c4cbb1dd66369efb77817c27512e84b1129d6b40[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Oct 9 16:40:35 2026 +0800

    fix: isolate plugin conversation sqlite from renderers

[33mcommit 45384c35f95e4270f360dbbea543d5089882fb47[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Oct 9 00:30:06 2026 +0800

    fix: normalize cross-client conversation UI projection

[33mcommit 67d6223522a101dbfccca7e4669d9434c93391a3[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Oct 8 21:59:05 2026 +0800

    fix: stabilize conversation compaction lifecycle

[33mcommit 4167c3d9552de2fdffe87f1badf2285c936dbb96[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Oct 6 18:42:57 2026 +0800

    fix: preserve session time and speed up history

[33mcommit 074ee8e3b1c240668022a022b566a08b6a2002af[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Oct 1 00:27:06 2026 +0800

    fix: improve conversation config feedback

[33mcommit ba345915d9ee8ad16c318b7b08700877603f0af0[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Sep 27 22:39:51 2026 +0800

    fix: improve conversation interaction

[33mcommit aad804c6417424a0a4d79951d5a6c3c1c451033b[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Sep 27 19:29:45 2026 +0800

    fix: align plugin conversation placement

[33mcommit 6f0b7e8721eea85fb3d424599fcc5c01e3e71ade[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Sep 24 21:24:57 2026 +0800

    fix: restore plugin conversation window state

[33mcommit 7c074dc54935a1469b8247d0d96b3544b5112031[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Sep 24 17:10:52 2026 +0800

    fix: enforce single writer conversation leases

[33mcommit 3329d869c30fdcf1a177ad10be8ac35d236aadd6[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Sep 24 13:31:23 2026 +0800

    fix: align sqlite binding with uTools ABI 110

[33mcommit 6116de23caeba584242b0e70812609689e1c12dc[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Sep 24 03:37:23 2026 +0800

    fix: support sqlite sessions in legacy uTools runtime

[33mcommit 6e256a374f510392ede0df3b55b6e0937f0564aa[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Sep 23 17:56:06 2026 +0800

    refactor: streamline compaction dialog

[33mcommit 31b60db19f902632163d8e50ee219388f761486a[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Sep 23 17:36:24 2026 +0800

    feat: add PDF context and prompt usage insights

[33mcommit 24382abdfae3e571ebab268dc0aab4b8ad6e9a64[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Sep 23 13:31:22 2026 +0800

    feat: migrate conversations to SQLite storage

[33mcommit f6634d9fd23ef3995ce97af560323fd09ded67a3[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Sep 11 19:00:50 2026 +0800

    fix: allow example environment files

[33mcommit 76e220ed85ea455d34c7b84166278d4db8741dc0[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Sep 10 20:06:07 2026 +0800

    feat: add cancellable sleep tool

[33mcommit ee7ae40fe37c9810056fc2b64ccce01b25c6008b[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Sep 10 13:16:10 2026 +0800

    feat: add persistent local image viewing

[33mcommit c8f136d3b66be844a253b0635ed07c59adbdba33[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Sep 9 16:05:39 2026 +0800

    feat: filter MCPs by assistant preset

[33mcommit 98f5f083dfee1ff5bf1d3fbd743318985dc1eafe[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Sep 9 15:41:40 2026 +0800

    fix: initialize chat request state early

[33mcommit bfb7ae6c78bf4c2984588e791cf87188493b66f9[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Sep 9 13:47:15 2026 +0800

    fix: serialize buffered chat turn handoff

[33mcommit 8ff3e5543fa87670b09299ab6266f6ffe606ca82[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Sep 3 17:24:32 2026 +0800

    feat: unify chat save options

[33mcommit 8a02c95fb5270a56e2401d15c94afc81230c7d25[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Aug 18 14:30:57 2026 +0800

    feat: add scheduled task device authorization

[33mcommit 35cf0c3c41d217b5516ece1d457f8d5af93af472[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Aug 13 21:56:32 2026 +0800

    perf: streamline compacted chat rendering

[33mcommit fdf457c6fd154b693bd243e98d300163db6a2255[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Aug 11 11:19:12 2026 +0800

    fix: unwrap provider batch test responses

[33mcommit 5169ff79cba948e7ebd126066e22d96b60b7e08b[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Aug 11 10:50:09 2026 +0800

    style: align compaction display controls

[33mcommit 71c70bf79abb096d5952aeb0474624a374bf234e[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Aug 11 10:42:13 2026 +0800

    feat: hide compacted chat messages

[33mcommit 3cac40e1ff0001856f38536cd6d18c4d0ac3ae9c[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Aug 10 16:00:42 2026 +0800

    fix: resolve historical chat edits safely

[33mcommit 32c23b9c398a60c61b12601c30d294a7373e6678[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Aug 3 20:46:32 2026 +0800

    fix: naturalize provider batch test prompt

[33mcommit d4516f29e91dc0898ee9ca8526b5cf94f48622bf[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jul 28 18:45:04 2026 +0800

    fix: align chat navigation scrolling

[33mcommit 3f4828495dd5d4ea1eadfa20561b19b85d39cbe9[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jul 28 18:23:09 2026 +0800

    fix: recover missing compacted tail messages

[33mcommit 188bb22cb401ced51d5a1e15dbd243a0e2c0007a[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jul 28 17:49:14 2026 +0800

    fix: recover compacted chat bubbles

[33mcommit 2d5f787a6590440b2ef1159f49b2d33ec1fd63a8[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Jul 27 12:31:12 2026 +0800

    fix: refresh context length on model switch

[33mcommit e5a99b7bbf7d02c3ae4be79382c82298dce8cb17[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Jul 27 11:48:23 2026 +0800

    docs: streamline README content

[33mcommit d4a0c0cf3661722620201d05737dcd09cd6c151f[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Jul 26 19:53:48 2026 +0800

    perf: remove heavy chat cache reconciliation

[33mcommit 8412177487e0bb8fcfd0b252f41782963647f6a6[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Jul 26 19:38:16 2026 +0800

    fix: preserve chat UI metadata and close smoothly

[33mcommit 5e51c67bd028cb380f7daf1a3756a05b25afd63e[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Jul 26 19:05:30 2026 +0800

    fix: heal edited chat message rendering

[33mcommit d38e467ebcdfb1306ccec9e9f2bafc511076ea0d[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Jul 25 01:18:11 2026 +0800

    fix: use local tokens for auto compaction

[33mcommit 5da2c2359ad264427dc063f03df150f027ebd895[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Jul 24 23:05:13 2026 +0800

    fix: recover auto compaction after cancellation

[33mcommit 143b8bc76aed78b14b7ae4d05645a17da6281581[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Jul 24 19:19:44 2026 +0800

    chore: remove compaction diagnostics

[33mcommit dc5cf67ead0d5cbc6e920e240f365dbf4a28395c[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Jul 24 19:12:11 2026 +0800

    feat: refine compaction progress dialog

[33mcommit 901724dbc7d1e7d464063f617438d1ae3ec8ed1d[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Jul 24 18:09:16 2026 +0800

    fix: bound compaction prefix by threshold

[33mcommit da35c876eed3738e2b38aedf9479743fa452bd2b[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Jul 24 17:12:18 2026 +0800

    fix: preserve full compaction prefix

[33mcommit d66448703f4aefea274dc70e2d9a394f7886fa02[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Jul 24 15:16:19 2026 +0800

    feat: export compact cache and gold compact nav

[33mcommit a7ba65872caf89cb48fc6b86b6efe00bfb6783a6[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Jul 24 15:01:58 2026 +0800

    fix: compact dialog close and toast feedback

[33mcommit 686c5d4b384a0cdf2f028a7bb4201227193170ab[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Jul 24 14:52:58 2026 +0800

    fix: show send loading while compacting

[33mcommit cae2b0c27e9dedeaaad27a28ed82996f3650f715[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Jul 24 14:35:03 2026 +0800

    fix: align tool-result compact and truncation

[33mcommit 1bc686640fc6e5f5b9eb33dd33eedafc153ea890[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Jul 24 14:32:26 2026 +0800

    fix: auto compact before ask and reask

[33mcommit efab7be7dac30f89fac363b8ecb9b46affcc59a5[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Jul 24 14:27:35 2026 +0800

    fix: restore plugin compact dialog controls

[33mcommit d0c38658bb0cb89c75a2e870603e2940643e24fb[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Jul 24 04:39:09 2026 +0800

    fix: show plugin compaction controls

[33mcommit 3419e289c3c41bb53dfee3bb1bd0139e0cdb36ea[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Jul 24 04:27:01 2026 +0800

    feat: sync full conversation compaction

[33mcommit fb24432e041e2e65f3c758ab01d2febe4a830cb9[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jul 21 18:01:13 2026 +0800

    fix: kill subagents on close and improve tag UI

[33mcommit 08fe543f8b41296bc7b433d8490033f2740d29e9[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jul 21 17:22:08 2026 +0800

    fix: enforce subagent conversation ownership

[33mcommit 2e78445d460903d1cf994b373cf368d1b417458d[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jul 21 17:01:42 2026 +0800

    fix: isolate subagents per conversation

[33mcommit 447c245d6e6a45b5a642d6d150ebe5863adf085b[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jul 21 16:35:31 2026 +0800

    refine: speed up subagent details

[33mcommit 6ac287b4331bc47299fc66a4b0b424f6cd96c2b4[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jul 21 16:03:22 2026 +0800

    refine: improve subagent task controls

[33mcommit bc72f3791ff2a3f50d02e2cbdb55a5ffab03b97a[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jul 21 15:43:24 2026 +0800

    feat: run subagents asynchronously

[33mcommit 10fa9c04a60e30d782a506243db9c9d98716ae90[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jul 21 11:11:29 2026 +0800

    fix: format object mcp tool results

[33mcommit 2d16aaef8db3fea0fe0477dc00b6880078c86226[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Jul 16 16:28:28 2026 +0800

    refactor: rename builtin web tools

[33mcommit 5e0eeeefb1e8a6ec4f9e607d00ca8c72a6a2760a[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Jul 15 20:45:15 2026 +0800

    fix: persist summon chats and local image paths

[33mcommit 543b69f5a5a1642ee1239e55baeb137ea3df3c8d[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jul 14 20:46:46 2026 +0800

    fix: fix provider model tag delete after batch close
    
    String modelList used item-key=model, so every draggable item shared key undefined and remaining close buttons stopped working after continuous deletes. Use model name as key, exclude .el-tag__close from Sortable, and serialize atomicSave.

[33mcommit 17bc19d52be4a69b5afd8ba999f0b845c345073a[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jul 14 20:41:35 2026 +0800

    fix: restore full code highlighting while streaming
    
    Remove the temporary plain-pre code-block downgrade that caused broken styles during rendering.

[33mcommit 02c5401659d71e34cbe22b9f228d9c1f593b4cca[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jul 14 20:34:06 2026 +0800

    perf: lighten streaming code block rendering
    
    Defer Shiki highlighting for open fences, move copy buttons into ChatMessage, and slow stream flushes while a code fence is open.

[33mcommit 94ea3857b29f323f085111c09a2b246ce48fd46b[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jul 14 20:31:03 2026 +0800

    fix: polyfill Timer.unref for MCP stdio close in uTools
    
    User-configured stdio MCP tools fail after invoke because @modelcontextprotocol/sdk closes transports with setTimeout(...).unref(), which is missing in the uTools preload timer runtime.

[33mcommit 40dba6cf34d155508532b7adcc9fd317d9464b8c[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jul 14 20:05:53 2026 +0800

    fix: remember model dialog provider collapse state
    
    Persist provider group expand/collapse in ui.windowModelDialogProviderCollapseStates so reopening the model picker restores the same layout as desktop.

[33mcommit ffa9fd6da2627796156063246fba8eab77b89812[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jul 14 20:01:17 2026 +0800

    fix: scroll model dialog to current selection
    
    Open model picker jumps to the active model, expanding its provider group when collapsed.

[33mcommit 74aec956e38405d55de7c80bd9aeee74ad182fbc[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Jul 10 17:29:23 2026 +0800

    fix: improve task and chat defaults

[33mcommit 277fbdae547ab297b423c72511c4d7e95afb0e07[m[33m ([m[1;31mgitee/main[m[33m)[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Jul 10 16:42:43 2026 +0800

    fix: preserve project assignment on autosave

[33mcommit 6577d2285cbbfa661950ed43cda1ed84fcba0df6[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Jul 9 21:44:17 2026 +0800

    feat: show resolved model logos

[33mcommit b18e7d6fd6ef71fb5d1c3fca5cb6b6d631d9a749[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Jul 9 14:21:44 2026 +0800

    fix: preserve code fences during katex preprocessing

[33mcommit 8beeebb092400123c74d38a23513fec3e8bed636[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Jul 9 10:32:04 2026 +0800

    增加致谢名单

[33mcommit d12d0416aba8db4f2adcf07d1a4c2320af27f1ba[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Jul 9 10:09:46 2026 +0800

    fix: harden scheduled task triggering

[33mcommit fa1d50ca69145db2cf91515c651357e95c910f1b[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Jul 8 20:07:20 2026 +0800

    style: refine auto-save project selectors

[33mcommit 55320c96d3d383d28ee3e81921b87b51873d679a[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Jul 8 18:19:08 2026 +0800

    feat: support auto-save chat projects

[33mcommit a877b5b8e9e46ac5b907d4e638630049e215add3[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Jul 8 17:05:36 2026 +0800

    fix: remove summon prefix from ai naming

[33mcommit 2c570a3a4f7773f9ef21a96abb9b0420fea065da[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Jul 8 16:59:28 2026 +0800

    chore: remove web search debug logs

[33mcommit 0623c4079a2f9e12776a53ca59b11a230eb8ef87[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Jul 8 16:53:16 2026 +0800

    chore: remove plugin scheduler diagnostics

[33mcommit bb91d0e9bc06897b67d2c848be1b53657ac9cb03[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Jul 8 16:43:54 2026 +0800

    chore: add plugin scheduler diagnostics

[33mcommit 96c4097527e6aa0a9270a9ae70aa582db43af44b[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Jul 8 16:14:03 2026 +0800

    fix: harden plugin task scheduler startup

[33mcommit 989525c53c55aad3d4b6a4d4d65d152b7140bec8[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Jul 8 13:54:34 2026 +0800

    style: refine plugin mcp oauth settings

[33mcommit a8b29a989b72841f52e22373da874d81613e3cd4[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Jul 6 16:13:18 2026 +0800

    feat: add mcp oauth support with runtime fixes

[33mcommit 6369e43532c0625150f0cfb7ed21ab88d810788e[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Jul 3 17:14:53 2026 +0800

    style: reduce plugin cloud skill dialog height

[33mcommit 80c5e2e7eea072fd37d7a89756a21bb43263237e[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Jul 3 17:10:28 2026 +0800

    style: compact plugin skill webdav dialogs

[33mcommit 2b0f8770eee33085ed56377904b3fb1a1592cf71[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Jul 3 16:31:59 2026 +0800

    feat: refine plugin skill sync ui and about page

[33mcommit b7474041cfe2c0655567cd6390ec43a8c5b65790[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Jul 3 15:13:02 2026 +0800

    fix: shorten provider batch test button label

[33mcommit 9c36df4e265d45d3296acaf61292cebb2254bdc0[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Jul 3 11:09:40 2026 +0800

    feat: sync plugin provider management and skill webdav

[33mcommit ceda677d8484e37c90c3bed4a866928b45e2f59e[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Jul 2 17:12:26 2026 +0800

    fix: sync plugin webdav chat metadata

[33mcommit 3377a2f89e76e9d6a29603f3f4d05cb2887cfc95[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Jul 1 21:53:45 2026 +0800

    fix: avoid stealing focus after ai response

[33mcommit 1efd7606c7bfe796490955b86007a5b5663be09b[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Jul 1 16:28:03 2026 +0800

    fix: recursively hide env files in skill export

[33mcommit ce3906a54bed35abc8da427d63bbea2054bdf26a[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Jul 1 12:28:59 2026 +0800

    fix: hide env when exporting skills

[33mcommit 72c016a75dcae272d7a8410b0c31e1d00f05e377[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Jun 29 21:22:21 2026 +0800

    fix: keep plugin streaming chat sticky to bottom

[33mcommit 6eece6d126d2b33d1d4c9e39530675c5fc3abfb9[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Jun 29 20:05:54 2026 +0800

    fix: sync plugin mcp icon skill export naming

[33mcommit f8149329905331578fb55fb53c057d1d33be3e4b[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Jun 25 11:51:26 2026 +0800

    优化文件链接跳转功能

[33mcommit 3973253538435a2116e57d07445c86beb8f1287b[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Jun 24 22:25:53 2026 +0800

    fix: preserve prompts with empty model

[33mcommit cb9ff43bdbdbfd79dd12ed12be3b599c14f08e0c[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jun 23 01:35:59 2026 +0800

    perf: lazy load window heavy deps

[33mcommit 902c6c8337170939318b9ddf4f7693d21c957816[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jun 23 01:09:56 2026 +0800

    fix: tokenize auto chat naming

[33mcommit f46cda8d5ea24f6e33c2145cd4ecb261babf7f42[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jun 23 00:53:27 2026 +0800

    fix: limit builtin grep output

[33mcommit 5c59eb7243942918d5080741aab9584881aef310[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Jun 22 22:09:14 2026 +0800

    输入模式为文件时，选择目录后能自动上传目录路径,修复ctrl+f检索跳转失败的bug

[33mcommit 24e9b11e567dec70e2e55b2941079fe8a57e391c[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Jun 22 21:28:02 2026 +0800

    perf: lazy load plugin window preload runtimes

[33mcommit 06468ffbac1affdca2a0a1a441fe006acc9084af[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Jun 22 20:46:52 2026 +0800

    修复选中内容显示两个相同的快捷助手的bug

[33mcommit 1cbea5129ad574dc19c58d4d1887c96f3e882811[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Jun 21 21:52:10 2026 +0800

    输入模式为文本或者通用时，选中文件夹召唤快捷助手，自动上传文件夹路径

[33mcommit a6262f7ef84cba637f1552d72401438afed9a272[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Jun 21 04:14:47 2026 +0800

    cancel assistant requests immediately

[33mcommit 3e2086fa7bde9d4e4f93dacb1110d7008fe9ff68[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Jun 21 03:30:19 2026 +0800

    fix: sync task panel positioning and strip ansi output

[33mcommit 513b6cdba44770a44b26209282bc48553c8ba797[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Jun 21 03:21:26 2026 +0800

    update from desktop: better work mcp & add prompt

[33mcommit a9d4358d6fb74376f6b6ffd859b2f458b277efe3[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Jun 20 19:49:19 2026 +0800

    feat: group chat history by projects and harden builtin file edit tools
    
    - add projects.yaml grouping (backend projects.js + js-yaml, exposed via window.api)
    - main UI: collapsible project groups, create/rename/delete, pointer drag-to-assign
      with auto-scroll, box-selection by data-basename, cloud assignment sync
    - chat window: project selector in save-json/save-cloud/rename dialogs
    - cloud projects handled in renderer webdav (read-modify-write) since plugin webdav
      lives in the renderer, not the backend
    - mcp_builtin: edit_file echoes changed section, auto-strips "NNNN | " prefixes,
      richer not-found diagnostics, read-first reminders (sync desktop 2d3e822)

[33mcommit 5565d1fc1592c5327d10b777595a3347372f3020[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Jun 20 17:00:45 2026 +0800

    feat: sync desktop updates (chat history sortable header, provider headers, codex/claude protocols) and fix codex empty reply
    
    - Chats.vue: clickable sortable table header (name/created/edited/size/actions)
    - provider custom request headers across chat/data/mcp/window/providers UI
    - codex & claude API protocols (new backend/src/anthropic.js, @anthropic-ai/sdk)
    - fix: parse codex stream as responses in window to avoid empty reply

[33mcommit c41227cf1a927522b5efe08b2113910da3f1956f[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Jun 19 16:35:32 2026 +0800

    feat: open plugin chat history from context menu

[33mcommit e81fb741c879d42a65242a7ed1ec1db62ad07ffc[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Jun 19 16:01:02 2026 +0800

    update README

[33mcommit 4aeed2cfec62e491fca0b4418f3224c1ed191c3d[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Jun 10 00:26:30 2026 +0800

    feat: use markitdown-js for plugin web fetch

[33mcommit b594f353d0071c324f0bd2d719f1d8595a36aaac[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jun 9 11:25:43 2026 +0800

    fix: restore plugin markdown placeholders

[33mcommit 8107c3c609e1a6c9cedd0bc73f12e673b434e8e7[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Jun 4 21:12:46 2026 +0800

    feat: show plugin reasoning token usage

[33mcommit ba7874199f198f3b2dc85b83a5718904ee302b58[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Jun 4 21:03:08 2026 +0800

    feat: show plugin assistant token usage

[33mcommit 6860074a8d35f3b1eefa98e2dee56f0dee701317[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Jun 4 19:56:50 2026 +0800

    调整工具窗口上下文限制

[33mcommit 41c0788dc053c066b56669ca82060698ab2cb882[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jun 2 15:30:29 2026 +0800

    update skill prompt

[33mcommit 9e283d7e21c48a97bebbfe6dab1937d170eed0d1[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat May 30 21:36:51 2026 +0800

    update README.md

[33mcommit 261a0a50b74dac3d56397ecc528fc653f0973280[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat May 30 20:53:21 2026 +0800

    优化历史对话加载逻辑

[33mcommit 191e350f0c0d7e14711ac62142361bf5f9e3e199[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat May 30 18:56:39 2026 +0800

    style: tighten plugin window nav node spacing

[33mcommit 994ddd4d70c6deffc59e3f2815fa7ab2d1d89bc2[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat May 30 18:36:40 2026 +0800

    feat: open plugin skill folder from manager

[33mcommit 0fcf9b880277d33c5d0fd76a4f9afddaaa8aadfe[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon May 25 21:15:56 2026 +0800

    feat: sync plugin save dialog auto naming

[33mcommit bd488878bde2ca6fa33846e7b86d576d1855d206[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon May 25 21:02:29 2026 +0800

    feat: sync plugin summon agent routes

[33mcommit df3d28f4316030313e6b96236ea56b9a7887f825[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon May 25 20:45:03 2026 +0800

    fix: sync plugin naming fallbacks

[33mcommit c8bd8935e5a44bd576cd8cd4eb4c2ec6a08f6765[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun May 24 23:40:11 2026 +0800

    fix: auto save named plugin chat sessions

[33mcommit 69262ba3548847b0f31b5a513b434d9defa432ea[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu May 21 03:05:36 2026 +0800

    fix: persist plugin session immediately after auto naming

[33mcommit 983e56d59add414220cc98dc309f2564e564ff7e[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu May 21 02:51:50 2026 +0800

    fix: auto save plugin window session after auto naming

[33mcommit c487bf5276708381da2b52cf8c2b001d92a4e834[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue May 19 22:01:25 2026 +0800

    fix: refine prompt footer and nav hover

[33mcommit 7fcd6a03eca139e6632ee11734f14637bd573e4b[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue May 19 21:46:30 2026 +0800

    feat: sync window nav and active-save behavior

[33mcommit e4140013562d9cebf4a083adc11673f960095d6d[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue May 19 21:45:40 2026 +0800

    feat: sync window nav and active-save behavior

[33mcommit 0affc21ba857b9d208b17d4af16661884a62d829[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue May 19 20:19:48 2026 +0800

    feat: sync auto naming flow in window

[33mcommit 96bbb6f78b23a043d6177f140ba400ccff30b4a6[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue May 19 20:09:54 2026 +0800

    feat: sync assistant route settings ui

[33mcommit 543711e66ecf76b879a4ae24dd9ae1e647abfec3[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue May 19 20:09:26 2026 +0800

    feat: support model route in task management

[33mcommit f98185a014f323c4fd81275ded31c23f91ea92ad[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue May 19 19:38:19 2026 +0800

    feat: sync assistant route model backend support

[33mcommit 3367c3c2316792ef2b40046badef51c09aad1394[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun May 10 14:57:08 2026 +0800

    update skill prompt

[33mcommit 6213ff4cec9f4eb3f087d9cb4fc87e97be069aac[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu May 7 15:06:08 2026 +0800

    fix: optimize task weekly dark theme and local skills path

[33mcommit b64b98c3c8672b1f33c5ba3f6b250a2a10ed3d0a[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu May 7 14:44:06 2026 +0800

    更新图标

[33mcommit e295b72fd1ade69a9cfeaf9a30e0334a3c7e8a4f[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Apr 28 11:13:46 2026 +0800

    fix(anywhere_main): optimize chats pagination and locale

[33mcommit 12ab4c0d1a1197f6abc5acc972bd93d9d3743558[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Apr 27 23:01:16 2026 +0800

    fix: support grep_search file path targets

[33mcommit d0c98729bc55ac98e383e27f8e929b101a789682[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Apr 27 20:34:52 2026 +0800

    fix: sync MCP runtime after config changes in chat window

[33mcommit 75e1183a4ea30c1d008d09ffacb72d840e47365c[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Apr 27 19:17:10 2026 +0800

    chore: remove temporary MCP timeout debug logs

[33mcommit 17442fa743babe24738e791dc4ce6625c7a4ad5d[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Apr 27 18:09:00 2026 +0800

    fix: pass MCP timeout through tool call path

[33mcommit 6c16071018180caf8fb7a5dc4ce4f9710394f2a5[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Apr 27 18:02:02 2026 +0800

    fix: honor MCP tool timeout beyond 60s

[33mcommit da26749f7dccae03326a386b0dc9ae5c7b23df4e[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Apr 27 17:36:28 2026 +0800

    feat: forward MCP timeout config to chat window

[33mcommit b8269f5536aa7bf003a189a8dae8df4e3db9f346[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Apr 27 17:34:42 2026 +0800

    feat: add MCP timeout setting in main panel

[33mcommit 0503b410e3dfe514c8788f8325d5212dfc6e915e[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Apr 27 17:31:31 2026 +0800

    feat: pass MCP timeout config to langchain adapter

[33mcommit 65ffbfdecbe5636d8a5c56d48bcee1e4f1b3b473[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Apr 27 17:05:51 2026 +0800

    fix: align default stream behavior between ui and backend

[33mcommit 8d946c992b6a5b7753ea9790b9604e8d924e827d[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Apr 27 17:00:58 2026 +0800

    fix: handle async iterable chat completion responses

[33mcommit 771aac4d966e2fde1e44dc789e087355bf56e3e9[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Apr 27 16:31:06 2026 +0800

    chore: polish reasoning content backfill flow

[33mcommit e978c21e3e3c765e95a30018f91bdd5f2a09d412[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Apr 27 16:30:06 2026 +0800

    fix: backfill assistant reasoning content in thinking mode

[33mcommit e6c70383154685ef78a013d885198fff62d68981[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Apr 26 14:58:10 2026 +0800

    refactor(window): remove timeline jump compatibility cruft

[33mcommit e41959b93a12773c0dc4b71c03bae87d2dbe9e51[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Apr 26 14:52:21 2026 +0800

    fix(window): scroll chat container on timeline jump

[33mcommit dddfc2bccc3be971647ddd2a49e44231d5b378fe[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Apr 26 14:41:52 2026 +0800

    fix(window): restore anywhere window timeline message jump

[33mcommit 925a78f18c4a3032c605b3e4a064474c4965fecc[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Apr 26 13:52:24 2026 +0800

    feat(chats): reveal exported local chat file

[33mcommit bf12af0212bec8000ad259324e3348e3b7bd7728[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Apr 26 13:17:53 2026 +0800

    feat(chats): add local history export action

[33mcommit de28840ce72b7c3bab38e921fb8ebf4c1a7abd1f[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Apr 26 12:49:19 2026 +0800

    feat(chats): add local chat export bridge

[33mcommit 35c8bd35dd0d02c49cc7a617fde4eaa4cc618516[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Apr 26 12:27:20 2026 +0800

    fix(window): center active timeline node in anywhere window

[33mcommit b287a6eb1388cc4757285dd9298e5ecb30e77277[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Apr 24 20:25:30 2026 +0800

    refactor(chat): remove redundant empty content fallback

[33mcommit 80d8cff9df308747422bb608edb682ce6706fd28[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Apr 24 18:30:47 2026 +0800

    fix(window): preserve reasoning and sanitize tool names

[33mcommit e166920b7a1a2e6e912655e8bf839d6c4ae4f67a[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Apr 23 17:19:26 2026 +0800

    优化命令行工具

[33mcommit 55020b8f3d5a1f94eba27c691eea8fe1cf393bc9[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Apr 22 21:46:38 2026 +0800

    优化super agent MCP

[33mcommit e4c3164491276885d10d270770dc6933e07d0676[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Apr 17 23:30:16 2026 +0800

    docs(readme): add desktop client crosslink

[33mcommit d5cbef5340ea3c040544f5f26855e5a1369d0fbf[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Apr 16 21:52:10 2026 +0800

    fix(window): prevent plugin mcp bootstrap reload storm

[33mcommit 9d97598f9cc78336039b446c97b44bf8cc1771ac[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Apr 16 19:10:48 2026 +0800

    fix(perf): remove autosave polling and cache chat metadata

[33mcommit 3eaf1f7d5b111e6433a5f7027abc8722d0201f99[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Apr 16 03:39:35 2026 +0800

    fix(chats): sync plugin session title metadata on rename

[33mcommit 3b7340a3ff7f374bd9ad58c347de582b58338b4b[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Apr 14 23:20:00 2026 +0800

    feat(chats): improve history sorting and sync metadata

[33mcommit a021797edd393cb8fdd2ff94078d7a02f3a7b71c[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Apr 9 01:19:54 2026 +0800

    优化summon_agent提示词

[33mcommit e8523adc9773dd500466758cc7b50358847e866c[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Apr 8 19:30:28 2026 +0800

    修复设置界面更新导致窗口缩放还原的bug

[33mcommit 6ab8d542d6b5183ebc1119707c0ade92100e716c[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Apr 8 17:07:18 2026 +0800

    修复默认快捷助手映射错误的bug

[33mcommit 1f725fcbe2c8492406d941b223dea2244a7da281[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Apr 3 23:24:27 2026 +0800

    优化独立对话窗口性能

[33mcommit 7f20d0850d0e8430ad5f33093f014a0ee11a18f4[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Mar 31 20:07:05 2026 +0800

    移除导出为图片/html/md时保存对话的功能

[33mcommit 2d8f8e6b09b7076a1e9aef8284425fafcef4f055[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Mar 26 17:57:59 2026 +0800

    更新agent名称提示

[33mcommit ff0f34727a4a2f5fa468b9c7ebe41290ccaaf523[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Mar 26 17:31:41 2026 +0800

    预防展示消息与历史不一致，并进行对齐善后

[33mcommit 0b5a84dbcbc9486ea0d8b2a9c2b729efd5ffac6a[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Mar 26 14:59:43 2026 +0800

    修复英文环境下恢复对话功能失败的bug

[33mcommit 66d7fcdf75c7c9cd2c88733ba0144b9f10da6760[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Mar 25 10:46:45 2026 +0800

    修复Agent间交流工具

[33mcommit 22e2fb4785436a0c8e03bfc82e3a7a21352d21a4[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Mar 24 11:01:39 2026 +0800

    优化工具调用时显示，优化memory提示词

[33mcommit b64621143ff082682e92884bfb4cc8531f6fbb86[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Mar 22 17:59:56 2026 +0800

    修复失焦关闭非空闲时刻关闭，修复失焦关闭与自动保存功能相互影响的bug

[33mcommit a3031546b99c7abe8bd6d4548b11e7681b624b41[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Mar 20 00:48:30 2026 +0800

    修复打开已有对话时，模型排序错误的bug

[33mcommit 8c6394307ed7518c48d6411c72b54ac68ca4f0a1[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Mar 20 00:36:34 2026 +0800

    修复部分格式skill导入失败的bug

[33mcommit fcbf12e6e6de3394ae7bbda10a8b4dcf941c8898[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Mar 17 17:02:34 2026 +0800

    修复浏览消息过程中,发送消息跳转到底部的bug;修复工具调用功能完成输入框聚焦到末端的bug

[33mcommit c5e1de7392d83957baf6dcccb7681bde6dba6159[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Mar 14 17:48:14 2026 +0800

    优化edit_file在windows下的表现

[33mcommit c6883674355d858162dd3ebdec7ae91a492032b5[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Mar 14 17:20:15 2026 +0800

    修复思考预算的提示与选择不同的bug

[33mcommit 904ad7bb239640a46cbc123b00f4ec728eabf6cd[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Mar 13 17:32:25 2026 +0800

    修复subagent误启用disabled tool的bug

[33mcommit 5ccf761e3ae984f0375c1ffddade7171a025c67e[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Mar 13 16:57:30 2026 +0800

    更新README

[33mcommit e568ad4366ad8e51e44c35e6ffacfacb86d3f56d[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Mar 13 16:20:48 2026 +0800

    添加致谢

[33mcommit 2a4ecc60c4b3ad6cbc9271732b75b9ec8e7c627f[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Mar 13 16:14:09 2026 +0800

    修复Stdio读取环境变量空格匹配失败的bug

[33mcommit 5f4c61e3e27999b921974bba65c732e92b1d9a9d[m
Merge: 15626d6 9884f6a
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Mar 13 16:10:54 2026 +0800

    Merge pull request #20 from gsy44355/main
    
    1. 修复skill误启用`Disabled MCP`的bug
    2. 修复Stdio MCP忽略系统环境变量的bug

[33mcommit 9884f6ad0c2d153e76cc5f2f4d00dbe21c6caf7b[m
Author: gsy <diverse_zombies_2k@icloud.com>
Date:   Fri Mar 13 15:23:54 2026 +0800

    1. MCP工具应该是用户开启哪个，哪个才能加载，而不是只要有skills就全部加载
    2. 扩展MCP env path

[33mcommit 15626d680cf521561a9c2ee639057bbc496c4366[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Mar 13 12:50:36 2026 +0800

    更新多语言文件

[33mcommit 5ccb1921e40c866f4285d8e1926d6a32e828d57a[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Mar 12 16:18:52 2026 +0800

    增强对文本类型的判断机制

[33mcommit 65f8bb5d639121b527724f2b0d2270ab3ee93038[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Mar 12 13:07:32 2026 +0800

    优化get_full_memory提示词

[33mcommit ac85668259a1ec7add284f1ed37632d633ccc8ed[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Mar 12 11:49:19 2026 +0800

    删除`显示通知`功能，新增memory同步

[33mcommit fdf84df26fe6653ac801a1d02487d89cb19281e6[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Mar 12 11:38:45 2026 +0800

    优化web_search工具

[33mcommit 1d885f29fba7ff0b3076318a2c413f752f35bea4[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Mar 11 22:34:24 2026 +0800

    更新ai.svg

[33mcommit 33b6430399c246edd354b7dea0d12d55cab4d8bd[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Mar 11 21:35:53 2026 +0800

    移除vue代码中的utools函数

[33mcommit 621d019645b91934ef2fcf7faf638e5a29f54618[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Mar 11 21:29:06 2026 +0800

    本地对话存储路径更新实时显示

[33mcommit 4227aba59d869da3dc6c77df6342d6a634916fcf[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Mar 10 20:18:03 2026 +0800

    服务商排序优化

[33mcommit 6066840d838220e3192af411d9996ec300cfb84d[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Mar 10 00:02:25 2026 +0800

    新窗口会进行位置偏离避免重叠

[33mcommit 27bfadc8ff4d8a8ef48e1862ae6398b7f760b7a1[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Mar 9 20:19:26 2026 +0800

    优化备份数据界面样式

[33mcommit c901e9eaa0fc5043602559408e6ed6c5f6b00f63[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Mar 9 19:45:49 2026 +0800

    增加内置记忆MCP

[33mcommit 70cf2c69ed9fadd969dfcf4d356500ae58f06de1[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Mar 9 16:47:10 2026 +0800

    修复快捷键监听并误删其他配置页面选中配置的bug

[33mcommit 87b5b4a825e6008f77958b18fa6ac6ae86c59bbe[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Mar 9 15:19:30 2026 +0800

    优化追问窗口命名与展示逻辑

[33mcommit 60b0d3f7f660677f9e918f8aa99d6ec9c4c3aea0[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Mar 9 15:04:03 2026 +0800

    优化模型选择框，增强insert_content的鲁棒性

[33mcommit 96c0012d4f8a50e2785cc792a1f5c485246bdaa1[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Mar 8 17:52:51 2026 +0800

    修复追问导致窗口状态改变的bug

[33mcommit a5e835ea461a5afbe8e2c0fc1297f7fba885ac4c[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Mar 8 17:36:04 2026 +0800

    优化追问功能：自动清理不存在的追问链接

[33mcommit cb320bba1467911b3de843629e2eb4d52a9297f8[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Mar 8 17:29:36 2026 +0800

    更新文档

[33mcommit 7c5524f0710398e6822c20b25f4c2a166da1e9a6[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Mar 8 16:31:59 2026 +0800

    增加追问模式，可以追问到某一个窗口

[33mcommit 1bb21dc51d6ae0433a7c3fafbe8e09322aa1ecd1[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Mar 8 15:02:41 2026 +0800

    快捷助手搜索页面可以按照服务商/模型名称搜索

[33mcommit c7325eddaf8912d31d384e67f3bef511e52def4d[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Mar 8 14:31:24 2026 +0800

    优化配置页面：状态保持

[33mcommit 558646561502b09b3a335c8db45d17a6beff5888[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Mar 8 14:06:47 2026 +0800

    思维预算支持none与xhigh参数

[33mcommit b572c74a4e95a62f6d0312c01de3dd401e3ec484[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Mar 8 13:43:15 2026 +0800

    召唤agent时，支持使用参数启用工具

[33mcommit 01b9e43130e908668d0afa8360330a0fdca5baa0[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Mar 8 00:53:08 2026 +0800

    read_file支持按行读取，grep_search和read_file行号展示方式统一

[33mcommit 1cdac4b521579eee59676f38554148aab99beb81[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Mar 7 23:42:40 2026 +0800

    支持gif图片上传

[33mcommit bfe5546b2e9580cde4a0969f945376e871c31d0d[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Mar 7 22:02:58 2026 +0800

    修复命令行执行工具取消执行失败的bug

[33mcommit c819ea35d96688331b35732a8ded802d349d2874[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Mar 7 19:45:14 2026 +0800

    增加关闭对话窗口功能

[33mcommit c7241c4dd7e5bdb10aebdf6f5ea13c474ce7d3e3[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Mar 7 02:23:48 2026 +0800

    避免自己与自己读与交流

[33mcommit 4d2edb5d58eb7c827b17e5fe199838dfad8aabab[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Mar 7 01:57:29 2026 +0800

    优化read_agent_chats大纲生成逻辑

[33mcommit aa2eff748ed871438a585ccde57548903349daf0[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Mar 7 01:12:36 2026 +0800

    优化read_agent_chats，优化subagent的工具配置机制

[33mcommit 048eba5300ac55fc09d16580398540d81b701b9f[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Mar 7 00:53:49 2026 +0800

    修复list agent会输出禁用的agent的bug

[33mcommit 7852de9964c5958a5bb05b577a64b6e0a7558c69[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Mar 7 00:19:56 2026 +0800

    修复summon_agent的并发错误，消除幽灵记录

[33mcommit 6869103a60115b8e42b928caead588094563f68a[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Mar 6 21:46:19 2026 +0800

    超级智能体工具优化，可以取消执行

[33mcommit 66a10bc186365d607778107daa4eaa3d8e9067a4[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Mar 6 21:09:04 2026 +0800

    更新sub_agent MCP为super_agent MCP

[33mcommit d562f87bc51b4c2f00730969205e2ae9d69cc98d[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Mar 6 17:11:31 2026 +0800

    修复备份管理界面的按钮样式bug

[33mcommit 6eeee0c3e19e4f68715d47de9b2abf0c900789dc[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Mar 6 16:56:46 2026 +0800

    优化命令行工具

[33mcommit e47170684fca9a4a6373ddec402429cd0b424c8d[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Mar 6 15:32:13 2026 +0800

    优化命令行执行工具，实现后台运行命令行功能

[33mcommit 51eb31b995081208eed47b43b5053c606d21b91c[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Mar 6 01:14:28 2026 +0800

    定时任务执行记录可以快捷打开对话

[33mcommit cd10e6d663a26908dd90b01cc04e3fbdea8e7615[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Mar 6 00:20:31 2026 +0800

    优化音频条

[33mcommit d1b82b79ae562da95c1dcdd77825ce0a26101e86[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Mar 5 22:39:25 2026 +0800

    对话窗口可以拖拽选择/取消选择

[33mcommit fff9e9a276b2291a41fafcb7b8410b7b1136a901[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Mar 5 22:09:09 2026 +0800

    优化设置页面样式

[33mcommit 599256efd87955a821a9232943747f78cbce8f1d[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Mar 5 20:47:16 2026 +0800

    优化定时任务设置页面

[33mcommit f5a0b7c263e1a7f72b92875582add1da3871cabf[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Mar 5 20:27:32 2026 +0800

    优化公式渲染

[33mcommit 59d74b3abab359d337a69ff1a07d839fe4fd097d[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Mar 5 19:34:21 2026 +0800

    优化样式

[33mcommit 9c5387f15e61d90471009626c0a6f51b4a6cf9f1[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Mar 5 18:04:42 2026 +0800

    优化grep_search与工具最大读入值

[33mcommit 4977845cee5a51eec2423d22ab61b6b3234124bc[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Mar 5 17:18:47 2026 +0800

    更新独立对话窗口的MCP样式

[33mcommit 03aa53e66c3d2d9fe0134bf6eeb57d9e44fec1c1[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Mar 5 16:34:01 2026 +0800

    优化MCP

[33mcommit 883607438daaecfc0ace6bdf316cf5875a9d2495[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Mar 5 16:26:51 2026 +0800

    新增内置MCP：时间获取

[33mcommit 08e4738fda3fafab5a2c0bb9b4f5830a4ca52771[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Mar 5 16:21:02 2026 +0800

    新增一次性定时任务功能

[33mcommit c96e2827714373147cd6daaffd1fb87011a95d9a[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Mar 5 15:40:53 2026 +0800

    设置页面可折叠

[33mcommit b7976f2b227af1d0aa9862c75671c3119de2755c[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Mar 5 14:57:48 2026 +0800

    清除不必要的参数

[33mcommit 91f8323dd9bde34565b12860997607f563d2d9ed[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Mar 5 14:34:06 2026 +0800

    优化界面样式，新增快捷键边界删除定时任务

[33mcommit c030cd01d516758fede1cecd233c61e9c7fb59e6[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Mar 5 13:56:15 2026 +0800

    增加定时任务MCP创建任务时对mcp与skill相关配置功能

[33mcommit 3e847bedd25652b1f361230bb15c10017d7f7af9[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Mar 5 13:44:30 2026 +0800

    新增定日任务的日期选项，并同步更新MCP，取消错过补救机制

[33mcommit d44153d766f62137d64de1d7ef627ab51e1f0c39[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Mar 4 23:57:53 2026 +0800

    优化定时任务提示词

[33mcommit 453ba441fea7e410a4f2dd592ff5183ee0cc2fa2[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Mar 4 23:08:21 2026 +0800

    增加删除文件快捷键，优化样式

[33mcommit e993f67af8469527ed3d3450989d9259d7dc828a[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Mar 4 22:16:56 2026 +0800

    优化历史对话界面样式

[33mcommit bc6d71002970ff04735ac3e62205048e3980125d[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Mar 4 21:49:27 2026 +0800

    更新文档

[33mcommit 14dbde746af5244acfa36c5006041f1c45be4fca[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Mar 4 21:40:45 2026 +0800

    优化定时任务的界面样式

[33mcommit 75a27961d4e9b4f81a1fcb84016c2f3bbed99081[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Mar 4 21:07:04 2026 +0800

    定时任务增加生效时间参数，优化相关MCP，并更新相关档

[33mcommit 43128fd8ab730494e6c59ddc260bcb539dc351f1[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Mar 4 20:41:07 2026 +0800

    修复定时任务MCP并行调用不生效的bug，修复使用指南共用一个滚动条的bug

[33mcommit 6ce19cd983c220115087a294674916e49836bbb2[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Mar 4 20:04:05 2026 +0800

    优化定时任务体验（提示词优化+MCP/SKILL选择优化）

[33mcommit 970957347282cdcb9cfcb45c232aad1804c9677f[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Mar 4 19:41:57 2026 +0800

    修复创建定时任务时会立刻执行一次的bug

[33mcommit f831040474075d11fe4cfaac5d390010c534be25[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Mar 4 17:58:50 2026 +0800

    更新文档与通知方式（github与gitee）

[33mcommit 6a6179ed90c2d79b55ca520a23a249fc3ec30c47[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Mar 4 17:16:21 2026 +0800

    更新模型选择相关样式

[33mcommit 958d229d0fd851457aeddecf77abae0639df535d[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Mar 4 16:30:25 2026 +0800

    更新定时任务MCP的ICON

[33mcommit cf4628da8b88e85c5a19322cd56cbd082458884a[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Mar 4 16:24:50 2026 +0800

    优化独立对话框的模型选择列表

[33mcommit dfa964c8eb92a207030d63052564618f97e62bfc[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Mar 4 14:07:05 2026 +0800

    增加定时任务功能与对应内置MCP

[33mcommit 900d1d1ce1710cd596b5c012d4f1c71d57501cc1[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Mar 4 10:46:01 2026 +0800

    优化对话消息保存为图片功能

[33mcommit 41de96e787fa842ed74bc3ddf93e9f58beacd774[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Mar 3 22:24:59 2026 +0800

    服务商、MCP与SKILL配置能实时同步独立对话窗口！修复skill配置中无法禁用skill的bug，优化配置界面的toggle样式

[33mcommit 35c5e0ac9f1c6a80b8a3837115493f4f8656df89[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Mar 3 17:42:05 2026 +0800

    优化深色模式下toggle按钮显示，拆分文本与截图的直接发送选项

[33mcommit 8f756ca63d26bf3b5463d63c9765689cd83fb74a[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Mar 3 11:58:22 2026 +0800

    优化兼容部分服务商的思考模式

[33mcommit 6c5f5b48fbfa1aa2cc5c12ba83237633a294996b[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Mar 1 02:10:39 2026 +0800

    修复skill与zip技能文件导入失败的bug

[33mcommit 6989fd41503a814503dfac1376a46c00429104dd[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Mar 1 01:25:59 2026 +0800

    增加图片导航功能，预览的图片能够点击查看上/下一张图片

[33mcommit 7772ac2c0fe1f583eda46cbd34fb4c86f2e7ed1b[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Mar 1 00:21:48 2026 +0800

    优化glob_files、gleb_search与replacement工具

[33mcommit df1daca18569bed601221f74856306963f24f152[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Feb 28 05:09:39 2026 +0800

    优化skill调用与工具反馈显示

[33mcommit 1a5acf67f48a0bd1b37f8e099afbf2d6e0311602[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Feb 27 16:17:51 2026 +0800

    修复skill启用时，恢复对话只启用内置MCP的bug

[33mcommit 93c36333a7bca2124f45efb37356a55684fbebe5[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Feb 27 15:45:18 2026 +0800

    修复上传图片不展示缩略图的bug

[33mcommit f33c8d0b187ae5af73b692c8b6bba20e1e5ee111[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Feb 27 02:00:41 2026 +0800

    设置保存图片最小宽度

[33mcommit beb6e023ba420496d140f0dfe91706fe7ddf9719[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Feb 26 23:14:35 2026 +0800

    优化保存后图片的样式

[33mcommit 36a2de3803e215725602376baa71d38219a2fc0c[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Feb 26 22:52:15 2026 +0800

    保存为图片后，背景图片一并保存

[33mcommit da2ae94b75cf8fc32fcf963ac94ae7e317c71b68[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Feb 26 22:32:30 2026 +0800

    增加保存对话为图片的功能，单条消息保存为图片时增加背景

[33mcommit 257d13d2d4b673eb39641ced31b1a2bf6771752a[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Feb 26 21:57:58 2026 +0800

    E:\APP\Anaconda\Scripts\activate && conda activate base

[33mcommit ba345d28626d5c7ecc7de2dbd36545060f6b9d41[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Feb 25 01:53:09 2026 +0800

    fetch工具对Discourse进行适配

[33mcommit c193af8c8c18f005534dd2921f7b12f0e76ea492[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Feb 24 23:14:05 2026 +0800

    增加CI

[33mcommit 44035e7ef340ff3bd175a97a684e2e386eb7aac4[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Feb 24 22:08:23 2026 +0800

    更新skill提示词

[33mcommit 855ebe34f2865629c8d913587f4ed1e269a9299f[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Feb 13 17:27:39 2026 +0800

    优化样式

[33mcommit 62a6a086aff31c672ce0bae73455ff53822a111e[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Feb 13 04:04:21 2026 +0800

    更新文件搜寻工具

[33mcommit 3955e83530c710b9f72f3cbb0796e4f021ef3074[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Feb 13 03:50:33 2026 +0800

    优化样式

[33mcommit 291921f0fbcfa1c4ce0258fb2f55652405866ecc[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Feb 11 16:20:09 2026 +0800

    样式优化

[33mcommit 081bd72ded383372a66ef8fe5085b45186b347a9[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Feb 8 21:06:49 2026 +0800

    修复response接口无法识别图片的bug

[33mcommit aed770261ec6367bc814327ad3741fbc3eaa9e61[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Feb 8 14:39:02 2026 +0800

    重构请求模块(chat.js)，新增对response api的支持

[33mcommit cc737d2a02aebb4f1ed510c7b051af1a6fa45fa9[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Feb 8 11:59:05 2026 +0800

    合并文件

[33mcommit 8f5727e3c013745c44b06004e6fff142f65a8fbc[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Feb 6 23:23:36 2026 +0800

    更新内联代码逻辑

[33mcommit bab1335a6f172b3524c3656135bf544b6888ae60[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Feb 5 22:06:28 2026 +0800

    优化本地对话刷新机制

[33mcommit 74e02b7583cf19e383ff2233cdfa5eb782d5afcb[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Feb 5 22:03:08 2026 +0800

    优化对话保存机制，修复序列中代码块渲染bug

[33mcommit 2ed6ba55f57a19069a54fb0470b469b5b4222f90[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Feb 5 16:52:57 2026 +0800

    更新README

[33mcommit 080e9860815caff4de324352123b57a1b5c1d366[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Feb 5 13:35:30 2026 +0800

    优化skill提示词

[33mcommit 49ec310a9598a430a407524965fc6fc7c0f0cd8a[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Feb 4 21:50:19 2026 +0800

    优化文件跳转：内敛代码块的文件路径点击后可以直接跳转

[33mcommit 4c399fab953642dcc378348421cf7e8a7928b8d1[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Feb 4 19:15:15 2026 +0800

    更改内置联网MCP工具名称，新增本地文件快捷打开

[33mcommit cbf38defe93d3b71fb878cfd2bc45b67b1c82547[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Feb 2 09:51:39 2026 +0800

    优化导航栏

[33mcommit 9e2114a55e0c94fa170f5adfbc5748e153afd5e3[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Jan 31 01:19:45 2026 +0800

    优化bash MCP的提示词

[33mcommit 424010fafedb072f559bd3bde467228a18360239[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Jan 31 00:38:07 2026 +0800

    函数简化

[33mcommit 4448e35b2b6dbcd78cdd11db445330f03cf158eb[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Jan 30 22:38:51 2026 +0800

    优化快捷键匹配方式，修复内置MCP编辑文件时错误转移空白字符的bug

[33mcommit 1ce54c29bea44b2898e49f34fff51861bcdca496[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Jan 29 18:03:47 2026 +0800

    修复AI回复图片时无法识别，更新同步目录

[33mcommit bade9b999fd07fdb065bc84442e55ea5e3fbce4a[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Jan 29 17:09:46 2026 +0800

    修复左上角使用指南红点显示错误的bug

[33mcommit a7169e793a976b3b43a7adad7e61521769b0e6f6[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Jan 29 17:00:10 2026 +0800

    新增skill导入导出功能

[33mcommit d9ead79997ec15cb6a7001863da3ecee2ca461bf[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Jan 29 15:15:29 2026 +0800

    优化文件操作MCP

[33mcommit 62bdb63ab6888cd3358d0d074b25b7362bd19e91[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Jan 29 03:30:21 2026 +0800

    更新内置的文件操作MCP，支持正则替换与基于正则插入内容，更加方便地编辑代码

[33mcommit 2f06a05b227835df7d8eb29f7772c4b39b7a1b7b[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Jan 29 03:09:26 2026 +0800

    更新skill提示词

[33mcommit 98a1ad6922f53d6f81b520a0c48f7c4859cb1fd7[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Jan 28 23:14:33 2026 +0800

    新增快捷输入SKILL的功能，并优化快捷输入MCP的功能

[33mcommit 5b729dc5d7f839c3eee6a5223abba6d11ad618f8[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Jan 28 22:22:46 2026 +0800

    修复内置命令行MCP可能存在的编码问题

[33mcommit a07ca62fb27d4f9d71c898e71f4bff8b00ada58a[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Jan 28 20:04:05 2026 +0800

    修复快捷助手设置默认skill后，独立对话窗口没有默认启用的bug

[33mcommit d4874141e4edd6c8cc041dbd11c673cf493d0340[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Jan 28 13:22:29 2026 +0800

    更新指南

[33mcommit cc4f52e414b750efbe23a7c38e79c0245582d761[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Jan 28 13:06:59 2026 +0800

    修复utools自云同步时，本地路径数据也被同步的bug

[33mcommit b168f92a412b2e007700c39375756b0ca92817f5[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Jan 28 02:16:50 2026 +0800

    更新使用指南，插件增加使用指南功能

[33mcommit 474d25d897f666a65eab6222f2341dd976415173[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Jan 28 01:07:17 2026 +0800

    更新说明文档

[33mcommit d060c3c6223073452e10b77512f034ed7ebc9606[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jan 27 22:50:45 2026 +0800

    优化内置MCP的反馈形式

[33mcommit 23361004f6f64873c634d0e6e020c1e305e9f36d[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jan 27 21:30:45 2026 +0800

    独立对话窗口也可以更改skill是否是子智能助手执行

[33mcommit 72c7742b5c9d3c9d056049da2d8fae6d445cafec[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jan 27 17:39:10 2026 +0800

    修复web_fetch，优化skill调用提示词

[33mcommit 7904be49e10843ac80b52e4fe22ce6499ec978df[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jan 27 17:23:14 2026 +0800

    优化内置MCP工具

[33mcommit 0ea8d8ee863aa23db3b2f1255f468bd825fc6173[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jan 27 15:46:44 2026 +0800

    修复系统音频录制的bug

[33mcommit 23ccdedcda6eb365589fb9f22c6c6c37cf77719e[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jan 27 15:10:58 2026 +0800

    更新子智能体的失败反馈机制

[33mcommit 3a31576e1bdaea559797e788e0bda773566c7536[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jan 27 14:46:16 2026 +0800

    优化子智能体调用skill的方式

[33mcommit 716f0d16d492baebe75f9b8845ef088499e5ba34[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jan 27 02:39:58 2026 +0800

    修复skill文件夹上传失败的bug

[33mcommit eec93a80be4d6fd1738cfebbea6d3a1e4dea620e[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jan 27 01:51:59 2026 +0800

    优化深色模式下table样式，修复命令行工具拦截错误的bug

[33mcommit d20bd0750d6915d56a06eef63d68226a9b1aea4f[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jan 27 01:07:29 2026 +0800

    更新样式与语言文件

[33mcommit 5e3c8678501a1466caae53889a3f0eb0002e7583[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jan 27 00:35:41 2026 +0800

    增加skill功能

[33mcommit 2ea030026ede0e0d2dddbecb82443ce9c6745fed[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Jan 26 15:59:15 2026 +0800

    mcp快捷选择触发符号更改为@，//留给skill

[33mcommit fad377a579d667c8cc3efe3cc87ad48d91f2655b[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Jan 26 14:33:47 2026 +0800

    优化选择框背景，增加快捷MCP选择功能

[33mcommit 3aa1cee8e0d5ab8cbf0bbc6af9841da1fff99726[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Jan 25 16:22:34 2026 +0800

    降低vue-element-plus-x版本

[33mcommit ffc153ffe2c61db3c6950b9a11099d3c212852e0[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Jan 25 02:31:19 2026 +0800

    优化命令行工具，增加超时参数，允许执行耗时命令

[33mcommit 723aeb772290a90d79d0b521870d304384bca49e[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Jan 25 01:58:26 2026 +0800

    优化web_fetch

[33mcommit e66908a61aabba15f17b3fa14f17f7e8db8bfebc[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Jan 24 17:32:12 2026 +0800

    更新样式

[33mcommit 458e7d423a36c0817358e074e3df4c0fb9c7f56e[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Jan 24 17:17:11 2026 +0800

    优化独立对话窗口的MCP显示

[33mcommit d5899cdce2bf79281bb0a623162be2c522ac8813[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Jan 24 16:25:37 2026 +0800

    更新全局自动保存会话按钮

[33mcommit 35091bfbc93c614fcf20c6bb8126699c56b92cfa[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Jan 23 17:59:46 2026 +0800

    缩放可以使用ctrl快捷键操作、界面过窄顶部内容会压缩

[33mcommit 4e40ae2835479778c188cbf1803f13c767a2e7ea[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Jan 23 17:42:23 2026 +0800

    对话管理界面增加一键清除古老会话功能

[33mcommit 9686dc6aaa1f30c0dee5bd9cec3d3be47a939dee[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Jan 23 17:16:53 2026 +0800

    修复失焦关闭启用时无法选择附件的bug，修复因为非法字符自动保存失败的bug，增加已保存的会话在关闭前自动更新的功能

[33mcommit 9aa0f8af84b42158c2a091416bb59408db0da205[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Jan 23 14:53:32 2026 +0800

    更新mcp统计与检索机制，可以检索标签，内置MCP不计入worker统计

[33mcommit a0bd0f80169c3a5e5b258ec5b1cda8beaa23f2d6[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Jan 22 19:20:43 2026 +0800

    优化包结构，减小插件大小

[33mcommit 7049998dc5cf45ce3f4eda3c5d842e12ab742eee[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Jan 22 18:39:46 2026 +0800

    优化工具调用样式

[33mcommit b12887894ee87561baaa6c916df5d39e8c9ed41c[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Jan 22 18:17:53 2026 +0800

    subagent的工具权限为最小权限原则，修复相关表述

[33mcommit fb6f9ee1895cf63009d701665a63a6f91689a030[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Jan 22 17:43:03 2026 +0800

    内置MCP自动更新

[33mcommit 984c05804b2b123a3265de31f85bd053b593f174[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Jan 22 13:47:56 2026 +0800

    增加内置MCP：subAgent！

[33mcommit 412e147ef57a2c98c42eb6a6055c1c1e7a623efc[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Jan 22 11:23:13 2026 +0800

    优化内置MCP提示词

[33mcommit 2ee3845d4cd6397ece568cfd51694105adf61aa0[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Jan 21 00:13:46 2026 +0800

    优化mcp默认提示词

[33mcommit 5051ab01c768696c02a451b40393dde2463ac5ad[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jan 20 23:50:44 2026 +0800

    优化MCP报错机制

[33mcommit 25c460b14be409a67a5b0ee8f3d66cb61f9fdc59[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jan 20 23:32:13 2026 +0800

    新增MCP具体工具的测试功能

[33mcommit 8f40cd50151a3301e3c69d1382beed48ffe371fd[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jan 20 16:04:39 2026 +0800

    兼容部分服务商的流式回复

[33mcommit 16b717060370bf89916d0f36762fa46ae056b7cd[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jan 20 15:56:31 2026 +0800

    优化文件操作工具

[33mcommit e74649653757156325c8ad4cd5bf26838c8ee506[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jan 20 11:07:19 2026 +0800

    优化bash工具

[33mcommit 4dfbb3c679df922c24db3b7a28cd27fe59f75541[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jan 20 10:37:47 2026 +0800

    增加默认网页抓取MCP~

[33mcommit 5205c2c7dfe4d7d1bc1ef3df7f6cb5fce972b5b6[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Jan 19 22:52:34 2026 +0800

    增加默认搜索MCP，感谢DDG~

[33mcommit 4499a9208f7615b5cb577fe3e8e92925ffc5e205[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Jan 16 16:07:00 2026 +0800

    更新会话自动保存功能与修改会话名称功能，增加全局会话自动保存按钮

[33mcommit f5346703c8b36cb202a0ad8b4de57d2932c4fc9a[m
Merge: 1ddfa85 d0d1ae5
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Jan 16 15:29:34 2026 +0800

    Merge pull request #17 from gsy44355/main
    
    增加聊天记录自动保存

[33mcommit d0d1ae5a4ae9a951c949909d7ab6c6a9eaeeba33[m
Author: gsy <diverse_zombies_2k@icloud.com>
Date:   Thu Jan 15 16:13:41 2026 +0800

    增加时间戳，防止命名重复

[33mcommit 22190ccb4fabbb34556f0edc77936860f5c12d10[m
Author: gsy <diverse_zombies_2k@icloud.com>
Date:   Thu Jan 15 15:53:00 2026 +0800

    增加对话记录自动保存逻辑

[33mcommit ffde523b82464bc4dbc6e398aa96729c4f9d5a9c[m
Author: gsy <diverse_zombies_2k@icloud.com>
Date:   Thu Jan 15 15:52:39 2026 +0800

    增加Mac打包脚本

[33mcommit 1ddfa85c67d55b3374fd2c887f153ad4794875a9[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Jan 14 17:28:09 2026 +0800

    优化对话滚动机制

[33mcommit 80da42ca06972fb1be4c71191c7762d24b2085b4[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jan 13 20:52:01 2026 +0800

    修复MCP中header丢失的bug

[33mcommit 1e81a6350ba11181704a63c8b9145a01e76be540[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jan 13 12:06:07 2026 +0800

    优化对立对话窗口的报错显示

[33mcommit 331e91ae6b2d6e4df07ddf66382e12c277e11317[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Jan 8 23:00:16 2026 +0800

    为MCP工具增加安全防护

[33mcommit b5075e12815952ba251f96c23dd0270e4f291d43[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Jan 8 17:47:13 2026 +0800

    增加可添加的文本类型

[33mcommit 58d4c0e77173f3877b576ecba1857b237844a8dc[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Jan 8 16:54:34 2026 +0800

    优化内置的python执行MCP，增加执行本地文件的功能

[33mcommit 28e31ab54158c08c1dab2e7d4adfa2498860734c[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Jan 8 16:41:56 2026 +0800

    增加服务商目录功能，增加内置MCP插件

[33mcommit 81f46f9c804425a264ab308e7cdebe1b50fb0fb7[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Jan 7 21:51:19 2026 +0800

    优化mermaid样式

[33mcommit c6d8127f228f2ea88b391466f92996a051ac8d0d[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Jan 7 18:02:57 2026 +0800

    优化align相关公式的渲染

[33mcommit 75990072ea2635b8a3b6aaa212e88559fa228399[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Jan 7 17:12:54 2026 +0800

    修复公式中\\tag渲染失败的bug

[33mcommit 39a28a4091c7b39532ba00824c093c511ef3d24f[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Jan 7 14:58:26 2026 +0800

    服务商增加目录功能

[33mcommit 9a61cdc768cf40538241aa116359e607b3a97f76[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Jan 5 11:36:46 2026 +0800

    增加主题色设置：跟随系统；更新独立对话窗口titlebar提示

[33mcommit 10ed798d7e853864ca5e997952fc2fb0eae0f32d[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Jan 4 19:54:22 2026 +0800

    修复设置页面时ESC键直接退出插件的bug

[33mcommit 4fb9ce63cb744ad7ea347f929ba1d94f1d92595e[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Jan 4 16:57:34 2026 +0800

    背景图片加载优化

[33mcommit 2e83453f31626e3522eb49b5291aebe3372847b8[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Jan 4 02:34:20 2026 +0800

    优化table渲染

[33mcommit ddd3089ab84080717d42f0a537642c54c4542955[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Jan 4 01:04:58 2026 +0800

    修复引用样式，更新文档中的域名

[33mcommit 976863f15e8dc124497b9052f3323946231c50a7[m[33m ([m[1;33mtag: [m[1;33mv1.10.9[m[33m)[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Dec 30 22:52:50 2025 +0800

    优化代码逻辑

[33mcommit 472801f59669d86ef7173ea9b68ff1d38405a243[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Dec 30 22:24:20 2025 +0800

    增加背景图片缓存机制

[33mcommit 2b13b925b6895fa8b6addcaa7f3cf8b572b1a470[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Dec 30 21:31:13 2025 +0800

    优化配置检查，增强稳定性，避免配置错误导致的程序崩溃

[33mcommit 25991c5af5fe096b5adcac155aa353350bd4e379[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Dec 30 01:17:12 2025 +0800

    修复主题颜色时，背景图片透明度与主题颜色不同

[33mcommit 8c8875b2dd1b2d0da6b111758524bcfa5be1d23f[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Dec 30 00:39:52 2025 +0800

    优化mcp缓存

[33mcommit 605ad229c451919fa54bfe6a8da952ce476cef42[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Dec 30 00:16:23 2025 +0800

    增强工具调用的鲁棒性

[33mcommit 5f9d5eead8e788e760f3328dc4944adaf9edd910[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Dec 29 23:43:10 2025 +0800

    优化mcp相关逻辑

[33mcommit 64446a42f89b48c22883b45dd4127d68e49f229e[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Dec 29 22:10:02 2025 +0800

    优化深色模式下的titlebar样式

[33mcommit a8d4ef3aba5a381e40a515be97460122fc624e8f[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Dec 24 16:26:58 2025 +0800

    优化多语言

[33mcommit adfcd3eb69e13d91149c46b6df9a922bc9d9d00a[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Dec 24 15:53:08 2025 +0800

    快捷助手头像可以详细设置，背景图片可以设置透明度与模糊度，修复图片信息复制失败bug

[33mcommit fe562a05b4350ee714974061db220de95ed3e85b[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Dec 22 11:49:37 2025 +0800

    修复正则表达式无法自动输入内容的bug

[33mcommit 4d92030adcb27494e78ccadc0616f2deb60951ff[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Dec 18 00:26:03 2025 +0800

    优化主题

[33mcommit a24b54e2697b34a7d1b1cd36bb22f92a5954b26c[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Dec 17 22:09:39 2025 +0800

    调整默认背景模糊为0.9

[33mcommit 81beb537e8da6bb9c346f0fe7188d68d90660afc[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Dec 17 21:46:25 2025 +0800

    调整独立窗口，配合背景使用

[33mcommit 1294bad33562bc0e82fede4d7bad7b9996caef18[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Dec 17 20:35:32 2025 +0800

    增加独立对话窗口背景设置

[33mcommit 8ffb16ea45acf5b1b4a212c572ca3044451ea527[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Dec 17 19:34:14 2025 +0800

    修复删除消息之后编辑消息失败的bug

[33mcommit b56e78230b9bbc54c21198620b651f6451d9a3db[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Dec 15 21:40:15 2025 +0800

    修复编辑消息气泡时，删除其他消息导致无法保存编辑的bug

[33mcommit 0b4813120ce2453e6457d940fae92fcc07fcecfa[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Dec 13 19:11:02 2025 +0800

    取消了独立对话窗口的最小限制（因为可以缩放，所以小窗口也可用）

[33mcommit bffb072782ae36bc5d34c01dbaa4c5a7dbca06a4[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Dec 11 22:35:37 2025 +0800

    快捷输入模式下，修复拖拽文本输入两次的bug

[33mcommit a037ff6b2034b1aa96c9abea0ce2330131d5b391[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Dec 11 21:08:50 2025 +0800

    优化界面默认音频时间条

[33mcommit ded8c897ad1ef2e8b68f7ee4dcc6d8a7419e4992[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Dec 11 17:30:42 2025 +0800

    修复深色模式下加载独立对话窗口时，短暂出现白色界面的bug

[33mcommit 79e519b10717636087081ed9496c820714a468fa[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Dec 10 21:49:04 2025 +0800

    开始v1.10.4

[33mcommit 213fa106c4c8c9163aa0ad70627e720d59cf5341[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Dec 10 21:47:26 2025 +0800

    更新文档

[33mcommit 4770edf1e7d85bb5aadf74060f76e398fb1019f1[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Dec 10 21:31:16 2025 +0800

    更新README.md

[33mcommit e40c31efc20c0a97ef5646a605f56bb07d01280d[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Dec 10 21:21:09 2025 +0800

    优化自动保存功能

[33mcommit 434efe1321fa8118c85ae86263338818699f142a[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Dec 9 23:21:48 2025 +0800

    更新临时logo

[33mcommit 32881800d0c864053ec14826547acd2b18be440e[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Dec 9 22:48:14 2025 +0800

    修复快捷输入模式再多显示器下调用时，显示器选择错误的bug

[33mcommit 8817f40e2eceac9748367f4839e6b7c054d03fae[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Dec 9 21:47:14 2025 +0800

    优化音频进度条

[33mcommit 54969469615858253aeb59a15b7edb79c9d9b62b[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Dec 9 01:37:33 2025 +0800

    优化独立对话窗口的MCP服务选择界面+其他部分优化

[33mcommit 9ee4eee50310ba63105da197304dee2b80d8cd4c[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Dec 9 00:01:08 2025 +0800

    修复深色主题bug，设置界面的主题更改，独立对话窗口也也会一同修改

[33mcommit 0196017ac380645c99a0aa87ba5849abd48d66b0[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Dec 8 23:07:09 2025 +0800

    微调主题

[33mcommit 0966727dc9f8772f14e180a55835a11f3890aeb0[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Dec 8 19:27:19 2025 +0800

    独立对话窗口增加搜索按钮，保存会话默认选择保存为json

[33mcommit a092d27661f6d1a0b788633596c311f54005847d[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Dec 8 10:23:47 2025 +0800

    微调样式

[33mcommit f2169ce510087676ef21a1526a1bacd1fb1a0708[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Dec 7 13:21:05 2025 +0800

    更新文档

[33mcommit 48a5611899913f663476de3ef8ac0bc920f04374[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Dec 7 12:18:12 2025 +0800

    优化粒子动画

[33mcommit d839f2a3d99e64665a23b16e4140eb1daa561676[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Dec 7 09:41:53 2025 +0800

    将剪切板、输入框模式更新为快速输入模式，优化独立对话窗口

[33mcommit 869a792bc440677ea5df619865fd89ed9894f152[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Dec 7 00:28:48 2025 +0800

    界面优化+补充文本信息功能完善

[33mcommit 5dd4fcda783954b815db96a440af2833c4263116[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Dec 6 04:24:04 2025 +0800

    修改模型选择器图标颜色配置方式

[33mcommit 3f046d14704e185284076a1f866d8832668c0341[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Dec 6 03:49:21 2025 +0800

    界面大优化！

[33mcommit b5baa0c9bb606884435c408dcbdc1be17d973c50[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Dec 6 01:16:50 2025 +0800

    修复主题色与utools主题色不一致时可能出现界面闪烁的bug

[33mcommit 75bbe0ac6f25bd017dbb2e255f5a0ae91f53d8b5[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Dec 5 23:23:57 2025 +0800

    代码优化

[33mcommit f96f8df123eb0164548caee2c101750d90b8d4bb[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Dec 5 10:43:34 2025 +0800

    优化mcp提示词

[33mcommit 2939921c9b970b5acfe609b9027d9b1ad837e316[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Dec 4 23:36:15 2025 +0800

    自动批准模式下，工具调用窗口默认关闭

[33mcommit a3ecfacaf6c007f66273771dcc57af40b8894299[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Dec 4 12:11:13 2025 +0800

    一揽子更新
    - [X] mcp停止执行按钮优化
    - [X] mcp确认执行、取消执行与自动批准
    - [X] mcp提示词修改
    - [X] 对话保存mcp信息
    - [X] 优化代码，文件处理放到backend，非独立窗口模式也支持读取docx与excel文件
    - [X] 图片复制失败

[33mcommit eae16c7afd1f0de61bb00de212ce639d2a11075a[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Dec 4 09:57:28 2025 +0800

    开始v1.9.13，修改mcp提示词

[33mcommit 3acb03714f7994fb535be12ff0b6301c94552850[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Dec 3 11:52:39 2025 +0800

    优化消息排版2

[33mcommit cce4336385c992a591deb8ec439e293329e9ca12[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Dec 3 10:57:07 2025 +0800

    优化消息排版

[33mcommit 568d658628332c5961b312535bd83a2be6573640[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Dec 2 19:13:29 2025 +0800

    微调头像位置

[33mcommit 115730dc1e24f00fafd1fa1b9d3b71321b602dc8[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Dec 2 19:04:18 2025 +0800

    修复工具调用显示

[33mcommit 6baf21162df194739af22c6e85aec1db09d6339c[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Dec 2 18:14:30 2025 +0800

    修复代码块显示错误

[33mcommit 95eeabed4d0ca9fe47e47d7a92caea7cba8190a9[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Dec 2 14:53:57 2025 +0800

    修改默认窗口大小

[33mcommit c68f4f58337c761541d310687e66c9d5ade877aa[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Dec 2 14:24:11 2025 +0800

    优化独立窗口样式，优化导出的html

[33mcommit 4eae8369774de4595aeece29c1e7640e6a0900de[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Dec 2 01:46:10 2025 +0800

    删除请求中的null字段

[33mcommit 371e75fdf7d657c26f7aa647ce269ed0202cd7be[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Dec 2 00:32:26 2025 +0800

    优化模型选择界面的模型卡片

[33mcommit d1bbe75755cd3a64ea4c1ca2933012c0040804da[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Dec 1 22:18:56 2025 +0800

    优化独立对话窗口的MCP弹窗

[33mcommit 2f38af117acc262bf2b24667d4c4991c924afe75[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Dec 1 21:30:41 2025 +0800

    优化主题

[33mcommit 84d422f3d800db60dcc34fe658a751295113a226[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Nov 29 14:49:22 2025 +0800

    优化导出html的的AI头像

[33mcommit 583fc26fc3c002f726cc642740e023954bd61358[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Nov 29 13:52:33 2025 +0800

    优化导出为markdown和html的功能

[33mcommit 949b0b8ce51e9af926520f7910caffe561ce5e84[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Nov 28 23:09:12 2025 +0800

    体验优化：修改用户最新消息后自动重新提问，修复系统提示词聚焦bug，增加置顶置底按钮

[33mcommit a2e9619a6a31adc573e0470dee0a9120b4cca64f[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Nov 27 14:06:40 2025 +0800

    保存请求中的额外参数

[33mcommit 5caeed08ea9bcbaf967339484c0cabb59b14cd78[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Nov 25 22:15:54 2025 +0800

    优化markdown加粗渲染

[33mcommit c1b53e0272341f82e03c989501b147a730601dbf[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Nov 25 14:53:45 2025 +0800

    开始v1.9.10

[33mcommit fa236c3d118e395a5c6d4077ec0410445307566f[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Nov 25 14:46:41 2025 +0800

    独立对话窗口的模型设置弹窗信息将随配置更新而更新

[33mcommit eb5eb65741e77b4f85e9c3b35204a238fc182249[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Nov 25 14:16:40 2025 +0800

    独立对话窗口的MCP服务在打开时能够自动更新配置，且可以搜索标签

[33mcommit ceba7ab839f2b611e7e0528c12ab91881be3e5f2[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Nov 24 11:58:53 2025 +0800

    对话窗口增加搜索功能 Ctrl/Cmd+F 唤醒

[33mcommit 0d438b330458d0d99a40e4eb0aa17f66bbf95797[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Nov 24 11:29:02 2025 +0800

    优化：模型选择框打开是自动搜索

[33mcommit e5aa4cb4eaa893a63ab1e362c1a8a65751dbbbd1[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Nov 19 17:00:27 2025 +0800

    修复公式渲染问题

[33mcommit 7224f596f00dff3f4f984bb00a7411d7ec323532[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Nov 18 13:56:50 2025 +0800

    Restore the mistakenly deleted open-source license

[33mcommit 20de2e1b06a640e4da2cd29afa849415f2e254dc[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Nov 18 13:53:04 2025 +0800

    修复README.md中错误的图片

[33mcommit a9e06adb4b3cb2bf8b95b81b207064c0151f8718[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Nov 17 22:43:01 2025 +0800

    开始v1.9.9

[33mcommit 0d5e7af07788851ec16f6554bd0df47e7e227158[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Nov 17 22:30:14 2025 +0800

    优化独立窗口：修复编辑message时，因为跳转窗口聚焦输入框的bug，优化选工具择框未被点击时自动消失

[33mcommit e53dacc105fe1ce3bf0208faf9c580de76548de1[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Nov 17 18:00:35 2025 +0800

    优化：保存对话时自动聚焦到命名输入框

[33mcommit 5999e8242e2fb05e9c9c1d8bb912f21370f0985b[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Nov 17 17:52:45 2025 +0800

    删除临时对话功能，独立窗口增加窗口置顶/取消置顶按钮

[33mcommit bb2caacde05655e41402c22a20e0e9469d7d9be6[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Nov 15 19:30:41 2025 +0800

    修复html相关代码转义过度的bug

[33mcommit 0239eb9c2238d162236d51de43b6f049d4da3192[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Nov 14 19:30:08 2025 +0800

    增加导出html文档的功能

[33mcommit fff587ae8a8381973f7a738f5e4fdc99554f1f3c[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Nov 14 19:12:09 2025 +0800

    防范xss与csrf攻击

[33mcommit 075eba2d65d524e16ada2e5df9ac52b8eca5332b[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Nov 13 20:38:55 2025 +0800

    优化设置界面

[33mcommit 8a6d60cad75991c82b7d2b01231d70945a50a702[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Nov 11 19:50:16 2025 +0800

    优化服务商配置界面，优化MCP持久化连接按钮

[33mcommit 18fa96aa77e02da15d059057cd77e62bfc24e432[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Nov 10 20:22:52 2025 +0800

    开始v1.9.8，优化MCP弹窗限制显示逻辑

[33mcommit 30064ed47a78d63a0ad2c128202780eb4470fb30[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Nov 10 15:56:07 2025 +0800

    优化文档中部分MCP报错提示

[33mcommit 6018dc22ec147904cef822ee8943ae82eacb1113[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Nov 9 02:58:14 2025 +0800

    增加MCP推荐

[33mcommit 5ff544e2b3464538e2d8d61819eceaa7aef2f0cc[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Nov 9 01:27:56 2025 +0800

    优化MCP设置界面弹窗显示

[33mcommit 52d848f42d3e5d2c1a784297672e5b340fd74c81[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Nov 9 00:39:49 2025 +0800

    更新文档

[33mcommit f70cb380271d00cb31251907be1f1c9225c1294e[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Nov 8 02:45:52 2025 +0800

    添加保存的快捷键与enter直接保存，优化图片渲染失败可以刷新

[33mcommit c2662eb00ec76d6c866fb423c017364a90131a0f[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Nov 8 01:52:17 2025 +0800

    修复窗口保护机制

[33mcommit 7775db7e742b18e5f143d1f255f9ebe310123752[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Nov 8 00:28:26 2025 +0800

    独立窗口优化MCP选择弹窗机制

[33mcommit e47e01b1848b61389e0a6f3d25943f531ab4e9b9[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Nov 8 00:08:13 2025 +0800

    优化测试功能

[33mcommit 04c95e887521eea1b38436cb0ea6c9752b0a99e7[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Nov 8 00:06:05 2025 +0800

    修复数据库存储嵌套bug

[33mcommit d292a6e46dc48a92268542976f02c0082de6165a[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Nov 7 22:58:35 2025 +0800

    优化MCP调用方式：设置持久化连接选项功能，进一步解放Utools中MCP的使用！

[33mcommit 680d51ac72dc32e1b764cac2b5b90047d80867de[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Nov 7 19:59:12 2025 +0800

    文本模式可以自定义正则匹配符

[33mcommit 4a887bdbf7f0d59206651f5e35cb8342ddc54939[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Nov 7 17:42:43 2025 +0800

    开始v1.9.7

[33mcommit 66077be19f8b104028219b8abba2eb69ef4408ab[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Nov 7 15:42:39 2025 +0800

    修复会话管理页面提示显示错误的bug

[33mcommit 7acfc14dc7090e439725a92570cd29baf2336195[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Nov 6 20:14:34 2025 +0800

    位置更新功能存在问题，回滚'点击左上角logo更新位置'，对话管理页面增加提示

[33mcommit c9b8c52a48a37387325d924e2279aba9b1dc0980[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Nov 6 15:54:06 2025 +0800

    修复位置更新不成功的bug

[33mcommit 5315a5df5b2a7a399202507a11dd5ae46f3afeff[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Nov 6 15:27:20 2025 +0800

    修复保存窗口大小后，窗口高度更改的bug

[33mcommit a9b31c9a9fdbb96e40cb894e5093af0cf097b7c7[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Nov 6 15:02:07 2025 +0800

    移除云端、配置文件对于本地对话路径的管理

[33mcommit f4a46f8306c8efad0625a81b973dd6ae5d4d8755[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Nov 6 00:03:39 2025 +0800

    优化mcp设置页面显示

[33mcommit 43d0643e6c241168c037a0b86fc953204dce63fd[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Nov 5 22:53:00 2025 +0800

    设置界面位置中默认路径保存更改,刷新只更新当前页面聊天记录

[33mcommit 52405e8205d8f13aeb91cec0825937d79a257e5f[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Nov 5 22:22:52 2025 +0800

    优化窗口最大宽度限制,但是不支持全屏打开,佛祖额易出现窗口遮挡

[33mcommit 9570f281be0a3fdc68e9ecd809cb929fb590c4f2[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Nov 5 22:02:05 2025 +0800

    已保存的对话都将间隔30s自动保存,修复窗口缩放的bug

[33mcommit 327c0e29b3372345d5717cc823ad7927ebab5623[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Nov 5 20:25:37 2025 +0800

    优化删除时云同步通知

[33mcommit 1c45bdb9ba779560871975063ff03e5fb452dd04[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Nov 5 19:59:19 2025 +0800

    更新本地存储与云端存储方式

[33mcommit 04fee98babfdfc9d42ee9e22c3b50ded6e3a1422[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Nov 5 16:45:09 2025 +0800

    独立对话窗口增加记住模型功能，以更新快捷助手配置;位置保存机制变为随着位置改变更新位置;取消发送按钮变成动图

[33mcommit da24f47323bbac2cd338b7cc2b4241bcafd488f1[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Nov 5 04:00:25 2025 +0800

    优化提示词配置和MCP配置页面显示，增加提示词配置页面直接打开助手功能

[33mcommit 1269045e6f36e2793d1d2a0b2e13a10db9ce6b81[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Nov 5 03:52:42 2025 +0800

    优化提示词配置和MCP配置页面显示，增加提示词配置页面直接打开助手功能

[33mcommit 34ea4de625181a0f52cfb8a9488ec025e69c67d7[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Nov 4 20:55:32 2025 +0800

    优化独立窗口调用逻辑

[33mcommit 74f4e5d9bd18fd20bee39b7fe7c1d7db90ecb6fd[m[33m ([m[1;33mtag: [m[1;33mv1.9.5[m[33m)[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Nov 4 13:02:26 2025 +0800

    修复打开他人旧对话，清除历史记录会导致系统提示词也被清除的bug，修复自动失焦关闭也消失的bug

[33mcommit 54ff252259e1d3dbbd350a4f9e6093f7ac43efe5[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Nov 4 11:41:53 2025 +0800

    调整用户气泡宽度

[33mcommit 0c00ef8fd7d487f52d354e05a7cf8b40f33cfa88[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Nov 4 04:10:36 2025 +0800

    优化AI气泡宽度

[33mcommit 0b6a2f94c7ec3e2c3e2aa98d72735fde37a70d5b[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Nov 4 03:54:09 2025 +0800

    优化样式，修复MCP加载完成之前发送信息的bug

[33mcommit 5707153c855941333ea4efa73d9d828ced1ae834[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Nov 3 21:01:57 2025 +0800

    对独立窗口的mcp服务进行排序

[33mcommit 554740881617b5c6cdb6a5643fbad208472c1696[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Nov 3 20:45:31 2025 +0800

    修复stdio类型MCP调用竞争的bug

[33mcommit 08872d2a1800e150a0fed39e725aa172126a4f36[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Nov 3 19:49:07 2025 +0800

    优化工具调用

[33mcommit 018132accdb79f16f58974f1852c2e2e18a7da07[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Nov 3 19:30:05 2025 +0800

    修复思考气泡消失的bug

[33mcommit 70f4599c2328ad4c8395b9acba535f39f212ead0[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Nov 3 17:30:01 2025 +0800

    截图模式能自调用截图

[33mcommit ce6a4b880092cd13599aecca3d5a4eb9446cc1ec[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Nov 3 14:10:35 2025 +0800

    修改MCP环境变量提示

[33mcommit d388f3700e1976865839a776496bccfd633a6d2b[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Nov 3 13:44:22 2025 +0800

    开始1.9.5

[33mcommit e5085d5d28e3e96a401134bd7a7c62b4b6c75228[m[33m ([m[1;33mtag: [m[1;33mv1.9.4[m[33m)[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Nov 2 06:19:25 2025 +0800

    兼容各种不规范表述的streamable http

[33mcommit e98d1b4cfdda57427a1da93661981f4be133f7a1[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Nov 2 02:47:27 2025 +0800

    mcp 增加http选项

[33mcommit a5085905864c85c338a89d1b7a03e679959b9730[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Nov 1 22:28:05 2025 +0800

    通过随用随加载，不用关闭的策略缓解Utools对MCP加载数量的限制，更改提示

[33mcommit 7a6d44dde454e4263026bf7f6833cb71c7bd49eb[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Nov 1 17:25:56 2025 +0800

    独立窗口界面切换模型支持搜索功能，消息提示可以点击消除

[33mcommit 3903e3606051dabe0a82158edb6eb4ee407254a8[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Nov 1 06:53:14 2025 +0800

    增加工具取消功能，优化工具条长度

[33mcommit 96bf1022ed416f1d3a049b4d8d4cc913c393a8cf[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Nov 1 05:21:00 2025 +0800

    优化重问机制，优化MCP连接为并行

[33mcommit 05608411db2a92477a58fff33c49f1fe2bca5e55[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Nov 1 02:51:52 2025 +0800

    一揽子更新，总之就是增加了很多功能
    
    本次更新主要聚焦于提升“快捷助手”的功能性、增强用户交互体验，并修复了独立窗口的若干问题。
    
    ---
    
    新增功能 (New Features)
    
    *   **快捷助手功能增强：**
        *   新增搜索功能，方便用户快速定位需要的快捷助手。
        *   快捷助手编辑界面底部支持多选标签，便于分类和管理。
        *   为快捷助手增加“默认MCP服务”选项，独立窗口启动时可自动选择关联的MCP工具。
    
    优化与改进 (Improvements & Optimizations)
    
    *   **MCP服务选择页优化：**
        *   新增“全选”和“全部清除”按钮，高效管理服务选择。
        *   优化交互逻辑：点击全选或清除按钮后，弹窗将保持打开状态，方便用户继续操作。
        *   增加“已选”和“未选”分类筛选按钮，方便查看当前状态。
        *   MCP服务列表项增加标签显示（如SSE、streamHTTP、Stdio等），提高信息识别度。
        *   MCP工具加载过程中，在顶部增加加载动画提示，优化用户等待体验。
    *   **设置页面重构：**
        *   设置页面信息密度增大，重要设置一目了然。
        *   高级可选设置默认自动折叠，保持页面简洁。
        *   删除多余或过时的注册表URL配置入口。
    *   **独立窗口布局优化：**
        *   调整独立窗口中工具调用（Tool Call）的显示位置，统一放置在对话框内容下方。
    
    修复问题 (Bug Fixes)
    
    *   **【独立窗口】** 修复了折叠状态下删除消息时，窗口会自动展开的错误。

[33mcommit 5102db8bcb77a7d9c74f053daae70ccc8d9c5b2d[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Oct 30 16:44:17 2025 +0800

    修复消息编辑失效bug，优化MCP提示词

[33mcommit 84ee2cf87617b038b177ead23d19f61514c26746[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Oct 30 16:01:25 2025 +0800

    修复工具调用临时系统提示词bug，增加请求失败随机密钥重请求功能，更加稳定

[33mcommit 8398b9312c40f5fc896e2dc9dd42b1e9a8a5cc72[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Oct 29 20:25:59 2025 +0800

    优化MCP调用提示词，修复MCP删除消息功能bug

[33mcommit 5f126d71f6dcd93e0c1c7b1a8bb9822f56a634e9[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Oct 29 17:22:59 2025 +0800

    优化MCP调用

[33mcommit f64ddf5299e2aa12e8a2da3ad6c5be2a10628c73[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Oct 29 11:17:09 2025 +0800

    初始增加mcp功能

[33mcommit feeed5316cb3fc71ca07c3e07d259e81ad2b5047[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Oct 28 17:55:23 2025 +0800

    开始v1.9.1

[33mcommit a5de903d03f5302060feca24e9c02d35a6c517e6[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Oct 27 13:39:11 2025 +0800

    修复未上传文本时无法编辑消息的bug，优化对话窗口样式

[33mcommit 3b21ce14ccc142061b16c5f8ae707aa1f31fd117[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Oct 26 01:32:39 2025 +0800

    修复神色模式下选择框的样式

[33mcommit 6f27731a581c87b5599349a9d27c3c0e9bc92878[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Oct 22 16:19:00 2025 +0800

    开始v1.8.3

[33mcommit 24634946e9db8c65e4de1c74753c61cd3d6dc715[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Oct 16 19:28:46 2025 +0800

    优化AI调用

[33mcommit 6afdb9d6c7aa6dff35b815cec71d9922847e6aa0[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Oct 14 21:48:44 2025 +0800

    改用openai库

[33mcommit 2a6bdc81d441cb39f05a7251a9e0b2765bb4ff2d[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Oct 13 23:13:34 2025 +0800

    优化对话中保存系统提示词的功能

[33mcommit ba3dd92aaec615b56c42fee42f86b807c1a37ff5[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Oct 13 22:29:13 2025 +0800

    快捷助手设置页面增加刷新按钮在右下角

[33mcommit 8234c66ab1939431280654000eba2e3e074e2723[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Oct 13 21:41:02 2025 +0800

    开始1.8.2，优化滚动条

[33mcommit 0c6933ffe77a50d7659b2f093baed51ad17c1450[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Oct 13 12:54:48 2025 +0800

    更换logo

[33mcommit d4afef1b1071320fc544013f9f25a6e0ae44985d[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Oct 13 11:34:13 2025 +0800

    优化读写，避免对话窗口系统提示词编辑与设置页面编辑冲突

[33mcommit 89852c77c94d0fb198b4d1771a966583e3f4f032[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Oct 13 10:50:27 2025 +0800

    修复暗色模式下toggle显示异常，简化消息编辑函数

[33mcommit a523db227be04ba4c776d86e5a5aaa7a71a4ebab[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Oct 13 10:13:07 2025 +0800

    优化编辑对话功能：自动滚动，自动聚焦，快捷键

[33mcommit c028484df14a5f42cc31de7ee33fbb0d88fc5a1a[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Oct 13 09:46:35 2025 +0800

    修复暗色模式下部分按钮显示异常

[33mcommit bbc795d11bfe3f9bee048c7b60d6fee26f9120d4[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Oct 13 09:36:42 2025 +0800

    增加编辑对话/系统提示此功能，优化快捷助手默认设置

[33mcommit 440282f29d5ad2dfdc9ff598cecb795fe644f794[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Oct 11 17:42:53 2025 +0800

    进行主题优化

[33mcommit d6c3fe412e5fdbe7a573d4318828a9de2d14a39d[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Oct 11 16:52:03 2025 +0800

    图片展示优化

[33mcommit 002d3cfdd440e5a0155ddc44bf51af5f590a8d47[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Oct 10 19:51:48 2025 +0800

    优化界面显示

[33mcommit 712885e19a7555cb1a1827911a431a68e2ec706b[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Oct 10 17:20:54 2025 +0800

    开始v1.7.11

[33mcommit ab3b2667a8f8cbdac7ffd27b947a2e4d0c5f454f[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Sep 26 11:07:30 2025 +0800

    服务商配置界面支持拖拽调整模型顺序

[33mcommit 86e9beafc7c71571ca551803e8a5dfa3ec68ea74[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Sep 26 10:46:41 2025 +0800

    快捷助手界面增加模型替换功能

[33mcommit 027709980bc064fead1e3f63b9491c7f8d642612[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Sep 26 10:26:17 2025 +0800

    开始v1.7.10

[33mcommit ddef5d04ec798562ff6b7ef50395ed2c262cf276[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Sep 25 13:12:53 2025 +0800

    开始1.7.9，修复连续语音对话时audio错误的bug

[33mcommit 2d3fa0681d148a2564fd85d473ac762bb7d69fd5[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Sep 15 22:57:43 2025 +0800

    修复配置预算之后，默认预算无法取消reasoning_effort的bug

[33mcommit 08c350778997a547ee1a529b065ee65068ab2453[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Sep 10 12:00:12 2025 +0800

    修复html渲染显示不全的问题

[33mcommit e48516a138d370351267949118a288f6f180a625[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Sep 8 12:23:24 2025 +0800

    开始1.7.8

[33mcommit db6aa6f17cb4c2bd2b0000d8e8024f3722d5668c[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Sep 6 11:45:54 2025 +0800

    优化webdav和api可用模型的弹窗显示

[33mcommit ff37c3060d2077e838308983b1d9819da9b6f084[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Sep 5 22:07:12 2025 +0800

    修改输入框最大高度为15行

[33mcommit 6a60c29c23a23f01ef4c0d543bfa8f7c3fccb1f0[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Aug 30 21:31:04 2025 +0800

    支持openrouter的gemini-2.5-flash-image-preview，但是注意该服务商只能进行单轮对话

[33mcommit a46178ada3169ad79ed5d9536d0831eeda857cb6[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Aug 30 19:51:30 2025 +0800

    开始1.7.6

[33mcommit 25b95c5e23857251578ec1da5e7796f8551d8613[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Aug 25 15:48:08 2025 +0800

    修复图片附件显示

[33mcommit 851cd64e5fb699e699f977f5d27abbe1670025e9[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Aug 19 21:20:03 2025 +0800

    优化对话等待

[33mcommit 0245eac183a27b1d5b7797c80a1a994405cf80fe[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Aug 19 19:45:38 2025 +0800

    优化公式显示

[33mcommit fe04553c0ae8dcec21e43252a4d29f87ee989b2e[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Aug 19 14:21:42 2025 +0800

    使用element-plus-x库渲染对话气泡，改动会有点大

[33mcommit 98fca68f8d6b37adc7882f6eac1d84416ac17b7d[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Aug 19 00:40:19 2025 +0800

    开始1.7.5

[33mcommit e41c4176c00cc8e8bdf8872b088a158742ccc5ea[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Aug 18 16:02:02 2025 +0800

    优化浅色模式下代码框颜色，关闭气泡中的滚动条

[33mcommit 35f011d28f5a8203f07225ecb37735cb92322d39[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Aug 13 18:39:34 2025 +0800

    优化左上角图标按钮

[33mcommit b00e7b8bbef4a85f444b4e84e9cc741c854993e8[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Aug 13 00:00:16 2025 +0800

    优化数据存储

[33mcommit 5d6307dfbf0bf1ab717936f861e994ea13f21682[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Aug 12 23:38:07 2025 +0800

    修改密钥输入框

[33mcommit ea8d67f6197fe6610f7850f7bfb8118f053551a7[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Aug 12 22:58:10 2025 +0800

    备份配置不需要输入文件后缀

[33mcommit 47106d4049aef796325c6a2959149751bb222694[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Aug 12 22:44:14 2025 +0800

    优化上下休息跳转

[33mcommit 174f27beb90a55b035b4375e8999454617d0b0f8[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Aug 11 02:25:44 2025 +0800

    开始1.7.4

[33mcommit 21c8acff19eb503a7feada4a1041b183f4a9b860[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Aug 11 02:16:28 2025 +0800

    修复空白打开的快捷助手标签无法被删除的bug,用设置部分增加批量修改的按钮：“窗口置顶”和“失焦关闭”，用于控制所有快捷助手的“窗口置顶”和“失焦关闭”的开关

[33mcommit 8f54165b69ae5ac9420e256c93935b0d38180eb2[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Aug 10 03:13:03 2025 +0800

    支持录取系统声音，发送音频时，输入框内容将一并发送

[33mcommit 0676b467a0163a2303f6ac46c4f54679b8ed1e72[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Aug 9 17:28:53 2025 +0800

    开始1.7.3

[33mcommit 5d19f79a83b8104428c4bbcae97e78cdc0fdb2ca[m[33m ([m[1;33mtag: [m[1;33mv1.7.2[m[33m)[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Aug 9 17:23:52 2025 +0800

    修复多窗口配置冲突，确保读写操作均基于最新数据

[33mcommit 0888a16818f0dead2d236f86b28c4917665628f3[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Aug 9 16:43:10 2025 +0800

    完善文档

[33mcommit f30126a802f6ca7e6faa4209ff868c4848ea5268[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Aug 9 01:48:36 2025 +0800

    修复云端会话打开失败的问题

[33mcommit 63c6971206058dcc4b5c14e5d6f8ee67911868cd[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Aug 9 00:54:14 2025 +0800

    每个助手都单独配置（失焦时自动关闭窗口、始终在最上层）

[33mcommit 25fcedec84c6fd20542dab0dc1f52019fe094e98[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Aug 9 00:22:08 2025 +0800

    恢复会话时使用原本快捷助手的窗口参数

[33mcommit 3856f019d8589d4b8d032f0b732425ddc2b5973a[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Aug 8 23:31:19 2025 +0800

    修复独立窗口下滑按钮跳过最新消息直接置底的bug

[33mcommit 344ade21ba20deac93f6b0c387002cdc64644baf[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Aug 8 22:46:26 2025 +0800

    每个助手都记录一个数据（窗口大小、窗口位置、流式传输），增加图标下载

[33mcommit ba9ea2104b0002f9d7bd979f29431f8b9816ce60[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Aug 8 21:38:50 2025 +0800

    修复自动聚焦到输入框末尾的bug

[33mcommit 877855f8df7440adeb4a5d26247c7a6f24be6e10[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Aug 8 21:14:55 2025 +0800

    调整独立窗口界面配色

[33mcommit 3201ee08ff062e018668f67d93fbde0547cd5e40[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Aug 8 20:24:10 2025 +0800

    修改语音设置的图标为mouth

[33mcommit 513462693e7635c9b1de993feade1f0c7c99e4fd[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Aug 8 20:10:59 2025 +0800

    优化自动滚动

[33mcommit 0b3000d8dab0038b5345ca78d040b9faa5f6361e[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Aug 8 19:13:54 2025 +0800

    恢复用户气泡和AI气泡颜色区分，修复mac系统下中文输入法输入英文回车键直接发送的bug

[33mcommit add7b5e2f1c279b369a6698d011fbfdbe4e99bfa[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Aug 8 18:32:18 2025 +0800

    修复总设置与快捷助手不同流式设置的bug

[33mcommit f439d422dafdaed495734b79edf6830312756cd7[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Jul 23 19:12:47 2025 +0800

    独立窗口页面增加思考预算

[33mcommit 5ca1d801df372ddf7957d5836cf541132220b52e[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Jul 23 16:49:19 2025 +0800

    设置页面增加思考预算设置

[33mcommit 9de9b0992b753ab66b0475fa840dd63ddbd2cf08[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Jul 23 16:40:17 2025 +0800

    开始v1.7.2

[33mcommit 043fbe32532e1384146020e9262b1ee4e311d039[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Jul 17 15:21:51 2025 +0800

    上传的文件名自动缩略、图片支持下载、优化浅色模式下独立窗口的颜色搭配

[33mcommit c35a618684bdd16ac3d34f3f6d71c8d387db997c[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Jul 16 01:00:27 2025 +0800

    更新文档

[33mcommit 518042dbf82565411afc8b3e4291194ed12f8c90[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jul 15 16:17:35 2025 +0800

    优化输入框/重发送,聊天显示AI名称、时间与声音

[33mcommit dbaada20b12561c94db448475882c34ed4912af1[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jul 15 14:34:04 2025 +0800

    移除水平模式输入框，修复输入框在AI回复阶段无法编辑的bug

[33mcommit 5ceeae290210e05ce2d95395ba6c47633f367b28[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jul 15 00:12:05 2025 +0800

    支持语音输出模型，如gpt-4o-audio

[33mcommit 8c8629baf7623bd8dc3f3a697e4e3ac1445ecff3[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Jul 14 20:54:30 2025 +0800

    增加语音输入

[33mcommit 6550aec342d808dae7970546f445ed36e8c0a49e[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Jul 14 16:21:44 2025 +0800

    更新REAMDE.md，准备新版本更新

[33mcommit 0d889242c2b7abbe211e63fd29bbb84e669983c7[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Jul 14 12:16:39 2025 +0800

    设置页面调整

[33mcommit 5a222a1c7e071503723cca4a0b7afb4e5429f571[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Jul 14 12:00:01 2025 +0800

    修复对话中上传长图，缩略图显示错误

[33mcommit 7ff552d03a3629508f4e0eec663d3a4b4e138498[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Jul 14 11:37:54 2025 +0800

    设置界面增加暗色模式

[33mcommit 7be7a9ef0636da8d8aa135ded506f7d704d7a423[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Jul 14 09:37:41 2025 +0800

    设置页面微调

[33mcommit 496d0c57afb5ad7d4ab8edb3fc3f46e64180e91f[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Jul 14 03:52:13 2025 +0800

    优化设置页面

[33mcommit ae12408833c4a7ca90d51993b2f3d98a386b366f[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Mon Jul 14 00:00:17 2025 +0800

    增加输入框样式

[33mcommit 01b00bbde20a8b476d51ced21e439a24c46d4335[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Jul 13 22:38:26 2025 +0800

    设置页面打开的对话带有默认名称

[33mcommit 0c46109bfa9b8ad790f526bad119b83e0edbbb77[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Jul 13 22:22:18 2025 +0800

    结合OPENAI风格，优化输入框

[33mcommit 32bff34e975cf3f3e3f4eec60e5236b7c8aed461[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Jul 13 21:53:32 2025 +0800

    修复拖拽多个文件只成功上传一个文件的bug

[33mcommit d915b269ce0183796781a0479a0f20513df97ad8[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Jul 13 21:14:37 2025 +0800

    修复复制粘贴多个文件错误的bug

[33mcommit a6e7a3e0bd1e99fce0b44878f51ab2ad7d0827d2[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Jul 13 19:47:13 2025 +0800

    优化独立窗口文件结构，保存打开的文件，默认使用原名称

[33mcommit 06907f417164d9f8d05102d41470faf099d2c11e[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Jul 13 19:01:00 2025 +0800

    优化设置页面的代码

[33mcommit bbbc2e4ae8a789d2392b1b5b2b21d33502247434[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Jul 10 21:55:07 2025 +0800

    修改文件结构

[33mcommit 75e948094377168f811fa2592cf97d7b65ff0efd[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Jul 4 13:11:28 2025 +0800

    1.6.12

[33mcommit 4b5e51b3cd082fc14ee637a36ad87c1df54e6ba9[m[33m ([m[1;33mtag: [m[1;33mv1.6.12[m[33m)[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Jul 3 21:54:08 2025 +0800

    指令配置优化

[33mcommit b5b40cacd98ed549c69c7eabe0d08c85cc70e301[m[33m ([m[1;33mtag: [m[1;33mv1.6.11[m[33m, [m[1;33mtag: [m[1;33mv1.6.10[m[33m)[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Jul 2 22:32:00 2025 +0800

    更新文档和教程

[33mcommit 783ab6530ae44740672eab33c063bd973df777e8[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Jul 2 21:20:23 2025 +0800

    增加对话折叠功能，方便查找历史对话

[33mcommit bd922927eabd7365e74599ddadc795ed88a61413[m[33m ([m[1;33mtag: [m[1;33mv1.6.9[m[33m)[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Jul 2 16:22:00 2025 +0800

    v1.6.9

[33mcommit 006cafe2bc7ba3a56cd603e68f32b3d2234e9521[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jul 1 00:42:54 2025 +0800

    v1.6.7

[33mcommit ab6e8f7ffeb40d752a2f815b30d9ffa46e167dd1[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Jun 22 04:19:34 2025 +0800

    修改README.md

[33mcommit 95a2a59924c2b72e593b39441a60a9b5e2da4134[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sun Jun 22 04:16:56 2025 +0800

    Create LICENSE

[33mcommit fa7bcf9702985a81dd5d64ff50676ca6107412da[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jun 17 19:32:41 2025 +0800

    增加导出为markdown格式

[33mcommit b1c0818b1adc1533eb367051f48e45f4daf28472[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Tue Jun 17 16:54:08 2025 +0800

    提供免费中转接口、支持对话导出、更新README.md与教程

[33mcommit b52bce6237085cfea87f7e471ad728cbf9f9cd2a[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Jun 14 23:29:37 2025 +0800

    窗口模式下：选中文件打开插件后聚焦输入框

[33mcommit 93a98e00c0a7a2fc73dc237d577d66777468efd8[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Jun 14 22:20:59 2025 +0800

    系统提示词折叠、头像更改为用户头像、导入文件功能完善

[33mcommit beb1d5db9cca556e0d7d74b75a93e181e042b9f7[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat Jun 14 02:13:40 2025 +0800

    增加模型检索

[33mcommit 51b4946f5b0c7e96b8f4e3121453fead0d53d275[m[33m ([m[1;33mtag: [m[1;33mv1.6.0[m[33m)[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Fri Jun 13 20:30:19 2025 +0800

    支持选择文件后调用，支持温度、流式响应设置

[33mcommit 9b32af16caefd24ad857f8b36f43da9b9e1c9c2d[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Jun 12 18:44:35 2025 +0800

    更新教程与README.md

[33mcommit e6ea2408ab0e86b7cf83039c842124c0c96d6ca5[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Jun 12 17:17:52 2025 +0800

    一揽子更新，同时开源设置页面、对话页面的vue3代码

[33mcommit 66794c0f74155647e3442ddf6453880b0d5b318c[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Sat May 17 18:21:09 2025 +0800

    快捷助手增加标签、增加自定义图标

[33mcommit 9a3d60f47ffd1a9875d87b91dd94b03223f0caac[m[33m ([m[1;33mtag: [m[1;33mv1.5.0[m[33m)[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Apr 16 15:16:40 2025 +0800

    v1.5.0

[33mcommit 0121ef3eff2f1fb7d3bf4d5946305fdd6595827b[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Wed Apr 2 12:52:04 2025 +0800

    vue 重构设置页面

[33mcommit 5288277aac2eb5b4caf92e8b3ee8489dd4ee32b3[m
Author: Komorebi-yaodong <20373108@buaa.edu.cn>
Date:   Thu Mar 20 15:02:31 2025 +0800

    test

[33mcommit 7c850d7889ea15d9095f336756096d37c09a6949[m
Author: ComorebiC <komorebizyd@outlook.com>
Date:   Tue Mar 11 20:17:03 2025 +0800

    增加教程

[33mcommit 8fc6bb31d66cd8448b6bd41e57b83b996c3f4749[m
Author: ComorebiC <komorebizyd@outlook.com>
Date:   Thu Mar 6 21:15:05 2025 +0800

    取消固定默认提示词

[33mcommit d9c4c1036aaac8c5862b6a51216d63e4e1c59f11[m
Author: ComorebiC <komorebizyd@outlook.com>
Date:   Wed Mar 5 23:08:02 2025 +0800

    增加调整provider位置的功能；优化界面显示，优化代码块显示，增加代码块的一键复制按钮；增加markdown预览图片后，左右查看相邻图片的功能；修复图片发送失败的bug；修复连续两次重新生成会阻塞其中一次

[33mcommit bcafb4315b8269ac0f028e580207c58386230004[m
Author: ComorebiC <komorebizyd@outlook.com>
Date:   Sun Mar 2 01:07:29 2025 +0800

    增加停止请求和重新请求功能,增加是否ctrl+enter发送消息的选择功能,增加是否开启成功响应功能;修复点击删除历史按钮后清空输入框内容的问题

[33mcommit b20f9a51eee5cf50eacc68f6f967a8479a61e926[m
Author: ComorebiC <komorebizyd@outlook.com>
Date:   Tue Jan 14 16:39:59 2025 +0800

    支持调整窗口模式下默认窗口大小,支持“窗口失去焦点后自动消失”功能,修复窗口模式下部分调用区域导致窗口显示不全的问题,修复窗口模式下追问的AI回复始终滚动到页面最底端的问题

[33mcommit 41b9c76357cec9c7b74c91618f26dbc9888f4030[m[33m ([m[1;33mtag: [m[1;33mv1.3.1[m[33m)[m
Author: ComorebiC <komorebizyd@outlook.com>
Date:   Sun Jan 12 14:36:13 2025 +0800

    增加在窗口中选择模型功能

[33mcommit 3f7d66328f87dde8a95e15372390e254aff4f21b[m[33m ([m[1;33mtag: [m[1;33mv1.3.0[m[33m)[m
Author: ComorebiC <komorebizyd@outlook.com>
Date:   Fri Jan 10 13:43:57 2025 +0800

    输入增加通用模式（即图片或 文本）；增加多服务商设置；窗口模式markdown图片显示优化；窗口模式增加清楚记忆按钮。

[33mcommit b28534064718500a3235fe0852a5033f38f2de0c[m[33m ([m[1;33mtag: [m[1;33mv1.2.4[m[33m)[m
Author: ComorebiC <komorebizyd@outlook.com>
Date:   Fri Jan 3 22:13:37 2025 +0800

    优化窗口显示页面

[33mcommit c825e824b955fab91d566ddf8be9864e9257f736[m[33m ([m[1;33mtag: [m[1;33mv1.2.3[m[33m)[m
Author: ComorebiC <komorebizyd@outlook.com>
Date:   Sun Dec 29 14:30:57 2024 +0800

    修复markdown渲染产生过多换行的问题

[33mcommit 3b3a2185480325dd37b061e5b9b118d16f55c696[m
Author: ComorebiC <komorebizyd@outlook.com>
Date:   Sun Dec 29 02:27:48 2024 +0800

    增加视频演示

[33mcommit 4912b5018673d0e14672ecb179f76672d65aae39[m
Author: ComorebiC <komorebizyd@outlook.com>
Date:   Sun Dec 29 00:27:42 2024 +0800

    增加追问功能，增加窗口模式的markdown格式渲染

[33mcommit 3b52ab4c225e89fdb12c0991be7adf84f549438b[m
Author: ComorebiC <komorebizyd@outlook.com>
Date:   Sun Dec 22 01:06:20 2024 +0800

    增加输出展示窗口选项
    支持拖动更改提示词顺序

[33mcommit 1fdd6886908fe8dc92eaac45c41417295c73f4bd[m
Author: ComorebiC <komorebizyd@outlook.com>
Date:   Sat Dec 21 00:51:54 2024 +0800

    1. 增加“自定义模型”功能 2. 增加“选择是否跳过输入文本的换行符”功能

[33mcommit 616176bbd2717d882b901aec86796d4ea5eb4527[m
Author: ComorebiC <komorebizyd@outlook.com>
Date:   Wed Dec 18 21:49:54 2024 +0800

    设置页面优化，使用系统prompts，修复已有提示词不能修改type的bug

[33mcommit a0d8997b8927808c06648de81665660874cdecdc[m
Author: ComorebiC <komorebizyd@outlook.com>
Date:   Tue Dec 17 14:33:44 2024 +0800

    first commit
