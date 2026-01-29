import os
import re
import shutil

# 查找版本号最新的目录，版本号命名方式为`v%d.%d.%d`，例如 v1.0.0
def moveDist():
    dirs = [d for d in os.listdir('.') if os.path.isdir(d)]
    version_dirs = [d for d in dirs if re.match(r'^v\d+\.\d+\.\d+$', d)]
    version_dirs.sort(key=lambda x: list(map(int, re.findall(r'\d+', x))))
    if not version_dirs:
        print("未找到版本目录 (vX.X.X)")
        exit(1)
    latest_version_dir = version_dirs[-1]
    return latest_version_dir

# 删除指定目录下的文件夹
def deleteFiles(dir, delete_dir):
    window_dir = os.path.join(dir, delete_dir)
    if os.path.exists(window_dir):
        shutil.rmtree(window_dir)

# 删除指定文件
def deleteFile(dir, delete_file):
    file_path = os.path.join(dir, delete_file)
    if os.path.exists(file_path):
        os.remove(file_path)

# 【新增】定义忽略规则：过滤 .map 文件、隐藏文件、node_modules 等
def get_ignore_patterns(path, names):
    ignored = []
    for name in names:
        # 过滤 Source Maps (.map)，这是减小体积的关键
        if name.endswith('.map'):
            ignored.append(name)
        # 过滤系统隐藏文件 (.DS_Store 等) 和 git 目录
        elif name.startswith('.') or name == '__pycache__':
            ignored.append(name)
        # 过滤 node_modules (双重保险)
        elif name == 'node_modules':
            ignored.append(name)
        # 过滤日志文件
        elif name.endswith('.log'):
            ignored.append(name)
    return ignored

# 通用的复制逻辑（合并了你原来的 moveDistFiles, movePublicFiles, moveFiles）
# 增加了过滤逻辑
def smart_copy(src_folder, target_folder):
    if not os.path.exists(src_folder):
        print(f"目录 {src_folder} 不存在")
        return

    # 强制先创建目标目录
    if os.path.exists(target_folder) and not os.path.isdir(target_folder):
        os.remove(target_folder)
    os.makedirs(target_folder, exist_ok=True)

    for item in os.listdir(src_folder):
        # 应用过滤规则到顶层文件
        if item.endswith('.map') or item.startswith('.') or item == 'node_modules' or item == '__pycache__':
            continue

        src_path = os.path.join(src_folder, item)
        dst_path = os.path.join(target_folder, item)
        
        print(f"  >> {src_path}")
        
        if os.path.isfile(src_path):
            shutil.copy(src_path, target_folder)
        elif os.path.isdir(src_path):
            # 关键：在递归复制文件夹时应用 ignore 规则
            shutil.copytree(src_path, dst_path, dirs_exist_ok=True, ignore=get_ignore_patterns)
        else:
            print(f"未知类型文件: {src_path}")

if __name__ == "__main__":
    latest_version_dir = moveDist()
    print(f"目标版本目录: {latest_version_dir}\n")

    # 1. 处理 main (Anywhere_main/dist -> v1.0.0/main)
    deleteFiles(latest_version_dir, 'main')
    print(f"正在更新 main 文件夹...")
    main_target_dir = os.path.join(latest_version_dir, 'main')
    smart_copy(os.path.join("Anywhere_main", "dist"), main_target_dir)
    print("main 文件夹更新完成\n")

    # 2. 处理 window (Anywhere_window/dist -> v1.0.0/window)
    deleteFiles(latest_version_dir, 'window')
    print(f"正在更新 window 文件夹...")
    window_target_dir = os.path.join(latest_version_dir, 'window')
    smart_copy(os.path.join("Anywhere_window", "dist"), window_target_dir)
    print("window 文件夹更新完成\n")

    # 3. 处理 preload (backend/public -> v1.0.0/)
    deleteFile(latest_version_dir, 'preload.js')
    deleteFile(latest_version_dir, 'window_preload.js')
    deleteFile(latest_version_dir, 'fast_window_preload.js')
    print(f"正在更新 preload 相关文件...")
    smart_copy(os.path.join("backend", "public"), latest_version_dir)
    print("preload 相关文件更新完成\n")

    # 4. 处理 fast_window (fast_window -> v1.0.0/fast_window)
    deleteFiles(latest_version_dir, 'fast_window')
    print(f"正在更新 fast_window 文件夹...")
    fast_window_target_dir = os.path.join(latest_version_dir, 'fast_window')
    smart_copy("fast_window", fast_window_target_dir)
    print("fast_window 相关文件更新完成")

    # 5. 在这几个目录下查u女鬼剑.gitkeep文件
    for dir in [main_target_dir, window_target_dir, fast_window_target_dir]:
        if not os.path.exists(os.path.join(dir, '.gitkeep')):
            open(os.path.join(dir, '.gitkeep'), 'w').close()