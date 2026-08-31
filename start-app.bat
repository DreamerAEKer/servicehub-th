@echo off
title DeptDocVault - Starting Server
cd /d "%~dp0"
echo ----------------------------------------------------
echo  Starting Department Document Vault (DeptDocVault)
echo  Checking port 3001...
echo ----------------------------------------------------

for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001 ^| findstr LISTENING') do (
    echo Port 3001 is in use by PID %%a. Stopping existing process...
    taskkill /F /PID %%a
)

echo Opening application in your default web browser...
start http://localhost:3001
node server.js
pause
