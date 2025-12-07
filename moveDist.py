import os
import re
import shutil

# 查找版本号最新的目录，版本号命名方式为`v%d.%d.%d`，例如 v1.0.0
def moveDist():
    # 获取当前目录下所有子目录
    dirs = [d for d in os.listdir('.') if os.path.isdir(d)]
    # 过滤出以v开头的目录
    version_dirs = [d for d in dirs if re.match(r'^v\d+\.\d+\.\d+$', d)]
    # 按版本号排序
    version_dirs.sort(key=lambda x: list(map(int, re.findall(r'\d+', x))))
    # 获取最新版本号的目录
    latest_version_dir = version_dirs[-1]
    return latest_version_dir

# 删除指定目录下的 window 文件夹和 main 文件夹内的全部内容
def deleteFiles(dir,delete_dir):
    # 删除文件夹
    window_dir = os.path.join(dir, delete_dir)
    if os.path.exists(window_dir):
        shutil.rmtree(window_dir)

def deleteFile(dir, delete_file):
    file_path = os.path.join(dir, delete_file)
    if os.path.exists(file_path):
        os.remove(file_path)

# 将指定目录下的dist文件夹内文件全部复制到指定目录下
def moveDistFiles(dir, move_dir):
    dist_dir = os.path.join(dir, 'dist')
    if os.path.exists(dist_dir):
        # 强制先创建目标目录（如果是文件则删除）
        if os.path.exists(move_dir) and not os.path.isdir(move_dir):
            os.remove(move_dir)  # 删除错误的文件
        os.makedirs(move_dir, exist_ok=True)  # 确保是目录

        for item in os.listdir(dist_dir):
            item_path = os.path.join(dist_dir, item)
            print("  >> ", item_path)
            if os.path.isfile(item_path):
                shutil.copy(item_path, move_dir)
            elif os.path.isdir(item_path):
                shutil.copytree(item_path, os.path.join(move_dir, item), dirs_exist_ok=True)
            else:
                print(f"未知类型文件: {item_path}")
    else:
        print(f"目录 {dist_dir} 不存在")

# 将指定目录下的文件全部复制到指定目录下
def movePublicFiles(dir, move_dir):
    public_dir = os.path.join(dir, 'public')
    if os.path.exists(public_dir):
        os.makedirs(move_dir, exist_ok=True)  # 确保是目录
        for item in os.listdir(public_dir):
            item_path = os.path.join(public_dir, item)
            print("  >> ", item_path)
            if os.path.isfile(item_path):
                shutil.copy(item_path, move_dir)
            elif os.path.isdir(item_path):
                shutil.copytree(item_path, os.path.join(move_dir, item), dirs_exist_ok=True)
            else:
                print(f"未知类型文件: {item_path}")
    else:
        print(f"目录 {public_dir} 不存在")

# 将指定目录下的文件全部复制到指定目录下
def moveFiles(dir, move_dir):
    if os.path.exists(dir):
        if os.path.exists(move_dir) and not os.path.isdir(move_dir):
            os.remove(move_dir)  # 删除错误的文件
        os.makedirs(move_dir, exist_ok=True)  # 确保是目录
        for item in os.listdir(dir):
            item_path = os.path.join(dir, item)
            print("  >> ", item_path)
            if os.path.isfile(item_path):
                shutil.copy(item_path, move_dir)
            elif os.path.isdir(item_path):
                shutil.copytree(item_path, os.path.join(move_dir, item), dirs_exist_ok=True)
            else:
                print(f"未知类型文件: {item_path}")
    else:
        print(f"目录 {dir} 不存在")
    

if __name__ == "__main__":
    
    latest_version_dir = moveDist()
    # input_makesure1 = input(f"删除 {latest_version_dir} 目录下的 main 文件夹？(y/n): ")
    # if input_makesure1.lower() == 'y':
    deleteFiles(latest_version_dir, 'main')
    print(f"已删除 {latest_version_dir} 目录下的 main 文件夹，正在更新dist文件夹至其中")
    main_dir = os.path.join(latest_version_dir, 'main')
    moveDistFiles("Anywhere_main", main_dir)
    print("main 文件夹转移完成\n")
    

    # input_makesure2 = input(f"删除 {latest_version_dir} 目录下的 window 文件夹？(y/n): ")
    # if input_makesure2.lower() == 'y':
    deleteFiles(latest_version_dir, 'window')
    print(f"已删除 {latest_version_dir} 目录下的 window 文件夹，正在更新dist文件夹至其中")
    window_dir = os.path.join(latest_version_dir, 'window')
    moveDistFiles("Anywhere_window", window_dir)
    print("window 文件夹转移完成\n")

    # input_makesure3 = input(f"删除 {latest_version_dir} 目录下的 preload.js 和window_preload.js(y/n): ")
    # if input_makesure3.lower() == 'y':
    deleteFile(latest_version_dir, 'preload.js')
    deleteFile(latest_version_dir, 'window_preload.js')
    deleteFile(latest_version_dir, 'fast_window_preload.js')
    print(f"已删除 {latest_version_dir} 目录下的多种preload.js，正在更新preload文件至其中")
    movePublicFiles("backend", latest_version_dir)
    print("preload 相关文件转移完成")

    deleteFiles(latest_version_dir, 'fast_window')
    print(f"已删除 {latest_version_dir} 目录下的 window 文件夹，正在更新fast_window文件夹至其中")
    fast_window_dir = os.path.join(latest_version_dir, 'fast_window')
    moveFiles("fast_window", fast_window_dir)
    print("fast_window 相关文件转移完成")