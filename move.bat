@echo off
cd backend

REM 使用 CALL 确保 pnpm build 执行完毕后，控制权会返回到下一行

echo === run backend build ===

CALL pnpm build

REM 检查 pnpm 是否运行成功
if errorlevel 1 (
    echo build error
    goto :eof
)

cd ..

REM 增加提示以确保用户看到这一步
echo.
echo === run Python : moveDist.py ===

python moveDist.py

:eof