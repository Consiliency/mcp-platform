# PowerShell Screenshot Wrapper for MCP
# This provides a more reliable screenshot mechanism than snap-happy

param(
    [string]$OutputPath = "$env:TEMP\screenshot.png",
    [string]$Format = "Base64"
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function Take-Screenshot {
    param(
        [string]$FilePath
    )
    
    try {
        # Get screen bounds
        $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
        
        # Create bitmap
        $bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
        
        # Create graphics object
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        
        # Capture screen
        $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
        
        # Save to file
        $bitmap.Save($FilePath, [System.Drawing.Imaging.ImageFormat]::Png)
        
        # Clean up
        $graphics.Dispose()
        $bitmap.Dispose()
        
        return $true
    }
    catch {
        Write-Error "Failed to take screenshot: $_"
        return $false
    }
}

# Take the screenshot
$success = Take-Screenshot -FilePath $OutputPath

if ($success) {
    if ($Format -eq "Base64") {
        # Read file and convert to base64
        $bytes = [System.IO.File]::ReadAllBytes($OutputPath)
        $base64 = [System.Convert]::ToBase64String($bytes)
        
        # Output as JSON
        @{
            success = $true
            data = $base64
            path = $OutputPath
        } | ConvertTo-Json
    }
    else {
        # Just return the path
        @{
            success = $true
            path = $OutputPath
        } | ConvertTo-Json
    }
}
else {
    @{
        success = $false
        error = "Failed to capture screenshot"
    } | ConvertTo-Json
}