# PowerShell script to take a screenshot on Windows
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Get screen bounds
$Screen = [System.Windows.Forms.SystemInformation]::VirtualScreen

# Create bitmap
$bitmap = New-Object System.Drawing.Bitmap $Screen.Width, $Screen.Height

# Create graphics object
$graphic = [System.Drawing.Graphics]::FromImage($bitmap)

# Copy screen
$graphic.CopyFromScreen($Screen.Left, $Screen.Top, 0, 0, $bitmap.Size)

# Save screenshot
$outputPath = "C:\Users\jenne\screenshot.png"
$bitmap.Save($outputPath)

# Convert to WSL path
$wslPath = "/mnt/c/Users/jenne/screenshot.png"

Write-Host "Screenshot saved to: $outputPath"
Write-Host "WSL path: $wslPath"

# Cleanup
$graphic.Dispose()
$bitmap.Dispose()