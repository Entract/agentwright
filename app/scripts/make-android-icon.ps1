# Draws the phone app's launcher icon: the same prompt chevron and cursor on a blue tile as the
# PC Scratchpad's icon. Writes every density Android asks for. Run again only to change the design:
#   powershell -NoProfile -File scripts/make-android-icon.ps1
param([string]$Res = (Join-Path $PSScriptRoot '..\android\app\src\main\res'))

Add-Type -AssemblyName System.Drawing

$top = [System.Drawing.Color]::FromArgb(255, 48, 105, 152)
$bottom = [System.Drawing.Color]::FromArgb(255, 24, 52, 84)

# The chevron and cursor, drawn inside a square of side $s whose corner is at ($x, $y).
function Add-Glyph($g, [single]$x, [single]$y, [single]$s) {
    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 255, 212, 59)), ($s * 0.13)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $points = @(
        (New-Object System.Drawing.PointF ($x + $s * 0.22), ($y + $s * 0.28)),
        (New-Object System.Drawing.PointF ($x + $s * 0.47), ($y + $s * 0.48)),
        (New-Object System.Drawing.PointF ($x + $s * 0.22), ($y + $s * 0.68))
    )
    $g.DrawLines($pen, [System.Drawing.PointF[]]$points)
    $white = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ($s * 0.12)
    $white.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $white.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawLine($white, $x + $s * 0.56, $y + $s * 0.72, $x + $s * 0.8, $y + $s * 0.72)
}

function New-Canvas([int]$size) {
    $bitmap = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bitmap)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    return $bitmap, $g
}

function Save-Png($bitmap, $g, [string]$path) {
    $g.Dispose()
    $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
}

# Older launchers: a finished tile, square with rounded corners or round.
function Write-Tile([int]$size, [string]$path, [bool]$round) {
    $bitmap, $g = New-Canvas $size
    $s = [single]$size
    $fill = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.RectangleF 0, 0, $s, $s), $top, $bottom, 90
    $shape = New-Object System.Drawing.Drawing2D.GraphicsPath
    if ($round) {
        $shape.AddEllipse(0, 0, $s - 1, $s - 1)
    } else {
        $d = $s * 0.4; $edge = $s - 1
        $shape.AddArc(0, 0, $d, $d, 180, 90)
        $shape.AddArc($edge - $d, 0, $d, $d, 270, 90)
        $shape.AddArc($edge - $d, $edge - $d, $d, $d, 0, 90)
        $shape.AddArc(0, $edge - $d, $d, $d, 90, 90)
        $shape.CloseFigure()
    }
    $g.FillPath($fill, $shape)
    $inner = if ($round) { $s * 0.74 } else { $s * 0.9 }
    $offset = ($s - $inner) / 2
    Add-Glyph $g $offset $offset $inner
    Save-Png $bitmap $g $path
}

# Current launchers: the glyph alone on a transparent square; Android supplies the blue behind it
# (values/ic_launcher_background.xml) and cuts the shape. Only the middle 61% is sure to be seen.
function Write-Foreground([int]$size, [string]$path) {
    $bitmap, $g = New-Canvas $size
    $s = [single]$size
    $inner = $s * 0.52
    $offset = ($s - $inner) / 2
    Add-Glyph $g $offset $offset $inner
    Save-Png $bitmap $g $path
}

$densities = @{ mdpi = 1; hdpi = 1.5; xhdpi = 2; xxhdpi = 3; xxxhdpi = 4 }
foreach ($name in $densities.Keys) {
    $dir = Join-Path $Res "mipmap-$name"
    $scale = $densities[$name]
    Write-Tile ([int](48 * $scale)) (Join-Path $dir 'ic_launcher.png') $false
    Write-Tile ([int](48 * $scale)) (Join-Path $dir 'ic_launcher_round.png') $true
    Write-Foreground ([int](108 * $scale)) (Join-Path $dir 'ic_launcher_foreground.png')
}
Write-Output "Wrote launcher icons under $([System.IO.Path]::GetFullPath($Res))"
