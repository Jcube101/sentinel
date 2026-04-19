@echo off
schtasks /create /tn "Sentinel Archive" ^
  /tr "\"C:\Users\jobjo\Github\sentinel-pipeline\venv\Scripts\python.exe\" \"C:\Users\jobjo\Github\sentinel-pipeline\archive.py\"" ^
  /sc onlogon ^
  /d MON,TUE,WED,THU,FRI ^
  /f
echo Sentinel Archive task created successfully.
pause
