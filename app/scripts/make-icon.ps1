# Draws the Python Scratchpad icon (a prompt chevron and a cursor on a blue tile) at every size
# Windows asks for and writes them into one .ico file. Run again only to change the design:
#   powershell -NoProfile -File scripts/make-icon.ps1
param([string]$Out = (Join-Path $PSScriptRoot '..\..\desktop\scratchpad.ico'))

Add-Type -AssemblyName System.Drawing

function New-Tile([int]$size) {
    $bitmap = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bitmap)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $s = [single]$size

    # Rounded tile.
    $r = $s * 0.2
    $d = $r * 2
    $edge = $s - 1
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, $d, $d, 180, 90)
    $path.AddArc($edge - $d, 0, $d, $d, 270, 90)
    $path.AddArc($edge - $d, $edge - $d, $d, $d, 0, 90)
    $path.AddArc(0, $edge - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    $top = [System.Drawing.Color]::FromArgb(255, 48, 105, 152)
    $bottom = [System.Drawing.Color]::FromArgb(255, 24, 52, 84)
    $fill = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.RectangleF 0, 0, $s, $s), $top, $bottom, 90
    $g.FillPath($fill, $path)

    # Chevron ">" in yellow.
    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 255, 212, 59)), ($s * 0.13)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $points = @(
        (New-Object System.Drawing.PointF ($s * 0.22), ($s * 0.28)),
        (New-Object System.Drawing.PointF ($s * 0.47), ($s * 0.48)),
        (New-Object System.Drawing.PointF ($s * 0.22), ($s * 0.68))
    )
    $g.DrawLines($pen, [System.Drawing.PointF[]]$points)

    # Cursor "_" in white.
    $white = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ($s * 0.12)
    $white.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $white.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawLine($white, $s * 0.56, $s * 0.72, $s * 0.8, $s * 0.72)

    $g.Dispose()
    $stream = New-Object System.IO.MemoryStream
    $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
    return , $stream.ToArray()
}

$sizes = 16, 20, 24, 32, 40, 48, 64, 256
$images = @($sizes | ForEach-Object { , (New-Tile $_) })

$file = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter $file
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $side = if ($sizes[$i] -ge 256) { 0 } else { $sizes[$i] }
    $w.Write([byte]$side); $w.Write([byte]$side); $w.Write([byte]0); $w.Write([byte]0)
    $w.Write([uint16]1); $w.Write([uint16]32)
    $w.Write([uint32]$images[$i].Length); $w.Write([uint32]$offset)
    $offset += $images[$i].Length
}
foreach ($image in $images) { $w.Write([byte[]]$image) }
$w.Flush()
[System.IO.File]::WriteAllBytes([System.IO.Path]::GetFullPath($Out), $file.ToArray())
Write-Output "Wrote $([System.IO.Path]::GetFullPath($Out)) ($($file.Length) bytes)"
