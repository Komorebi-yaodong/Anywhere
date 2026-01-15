#!/bin/bash

# 构建 Anywhere_main
echo "=== build Anywhere_main ==="
cd Anywhere_main
pnpm install
if [ $? -ne 0 ]; then
    echo "Anywhere_main install error"
    exit 1
fi
pnpm build
if [ $? -ne 0 ]; then
    echo "Anywhere_main build error"
    exit 1
fi
cd ..

# 构建 Anywhere_window
echo ""
echo "=== build Anywhere_window ==="
cd Anywhere_window
pnpm install
if [ $? -ne 0 ]; then
    echo "Anywhere_window install error"
    exit 1
fi
pnpm build
if [ $? -ne 0 ]; then
    echo "Anywhere_window build error"
    exit 1
fi
cd ..

# 构建 backend
echo ""
echo "=== build backend ==="
cd backend
pnpm install
if [ $? -ne 0 ]; then
    echo "backend install error"
    exit 1
fi
pnpm build
if [ $? -ne 0 ]; then
    echo "backend build error"
    exit 1
fi
cd ..

# 运行 Python 脚本移动文件
echo ""
echo "=== run Python : moveDist.py ==="
python moveDist.py
