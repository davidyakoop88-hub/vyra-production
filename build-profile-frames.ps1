Add-Type -AssemblyName System.Drawing

$output = Join-Path $PSScriptRoot '..\assets\images\profile-frames'
$sources = @(
    @{ Path = (Join-Path $PSScriptRoot '..\assets\images\profile-frames-premium\premium-sheet-key.png'); Rows = 3; Names = @('midnight-amethyst','arctic-couture','rose-atelier') },
    @{ Path = (Join-Path $PSScriptRoot '..\assets\images\profile-frames-premium\couture-sheet-key.png'); Rows = 2; Names = @('champagne-crown','sapphire-nocturne','emerald-elan','pearl-lumiere','ruby-velvet','aurora-diamond') }
)

foreach ($sourceInfo in $sources) {
    $source = [System.Drawing.Bitmap]::FromFile($sourceInfo.Path)
    $cellWidth = [Math]::Floor($source.Width / 3)
    $cellHeight = [Math]::Floor($source.Height / $sourceInfo.Rows)

    for ($index = 0; $index -lt $sourceInfo.Names.Count; $index++) {
        $column = $index % 3
        $row = [Math]::Floor($index / 3)
        $cell = New-Object System.Drawing.Bitmap $cellWidth, $cellHeight, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $graphics = [System.Drawing.Graphics]::FromImage($cell)
        $graphics.DrawImage($source, (New-Object System.Drawing.Rectangle 0,0,$cellWidth,$cellHeight), (New-Object System.Drawing.Rectangle ($column*$cellWidth),($row*$cellHeight),$cellWidth,$cellHeight), [System.Drawing.GraphicsUnit]::Pixel)
        $graphics.Dispose()

        for ($y = 0; $y -lt $cell.Height; $y++) {
            for ($x = 0; $x -lt $cell.Width; $x++) {
                $pixel = $cell.GetPixel($x,$y)
                $dominance = $pixel.G - [Math]::Max($pixel.R,$pixel.B)
                if ($pixel.G -gt 150 -and $dominance -gt 42) {
                    $alpha = [Math]::Max(0, [Math]::Min(255, 255 - (($dominance - 42) * 4)))
                    $green = [Math]::Min($pixel.G, [Math]::Max($pixel.R,$pixel.B))
                    $cell.SetPixel($x,$y,[System.Drawing.Color]::FromArgb($alpha,$pixel.R,$green,$pixel.B))
                }
            }
        }

        $target = Join-Path $output ($sourceInfo.Names[$index] + '.png')
        $cell.Save($target,[System.Drawing.Imaging.ImageFormat]::Png)
        $cell.Dispose()
    }
    $source.Dispose()
}
