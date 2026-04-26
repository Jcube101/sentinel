$action = New-ScheduledTaskAction `
  -Execute "C:\Users\jobjo\Github\sentinel\pipeline\venv\Scripts\python.exe" `
  -Argument "C:\Users\jobjo\Github\sentinel\pipeline\archive.py" `
  -WorkingDirectory "C:\Users\jobjo\Github\sentinel\pipeline"

$trigger = New-ScheduledTaskTrigger -AtLogOn

$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

Register-ScheduledTask `
  -TaskName "Sentinel Archive" `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -RunLevel Highest `
  -Force

Write-Host "Sentinel Archive task created successfully."
