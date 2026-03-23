/**
 * Crop Tool
 *
 * Interactive crop overlay for the image editor.
 * Features: draggable selection, aspect ratio presets, numeric coordinate inputs.
 */

import { useState, useCallback, useRef, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CropToolProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  onApply: (cropData: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => void;
  onCancel: () => void;
  isProcessing: boolean;
}

type AspectPreset = "free" | "1:1" | "4:3" | "16:9" | "3:2";

const ASPECT_RATIOS: Record<string, number | null> = {
  free: null,
  "1:1": 1,
  "4:3": 4 / 3,
  "16:9": 16 / 9,
  "3:2": 3 / 2,
};

export function CropTool({
  imageUrl,
  imageWidth,
  imageHeight,
  onApply,
  onCancel,
  isProcessing,
}: CropToolProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [aspectPreset, setAspectPreset] = useState<AspectPreset>("free");

  // Crop coordinates relative to the original image dimensions
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [cropW, setCropW] = useState(imageWidth);
  const [cropH, setCropH] = useState(imageHeight);

  // Display dimensions (scaled to fit container)
  const [displayScale, setDisplayScale] = useState(1);

  // M6: Mouse drag state for defining and moving the crop area
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<"move" | "draw" | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCropOrigin, setDragCropOrigin] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  useEffect(() => {
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth;
      const maxHeight = 500;
      const scaleX = containerWidth / imageWidth;
      const scaleY = maxHeight / imageHeight;
      setDisplayScale(Math.min(scaleX, scaleY, 1));
    }
  }, [imageWidth, imageHeight]);

  // M6: Convert mouse position to image coordinates
  const getImageCoords = useCallback(
    (e: React.MouseEvent | MouseEvent): { x: number; y: number } | null => {
      if (!containerRef.current) return null;
      const imageEl = containerRef.current.querySelector("img");
      if (!imageEl) return null;
      const rect = imageEl.getBoundingClientRect();
      const x = (e.clientX - rect.left) / displayScale;
      const y = (e.clientY - rect.top) / displayScale;
      return {
        x: Math.max(0, Math.min(x, imageWidth)),
        y: Math.max(0, Math.min(y, imageHeight)),
      };
    },
    [displayScale, imageWidth, imageHeight],
  );

  // M6: Handle mouse down on the crop overlay area
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const coords = getImageCoords(e);
      if (!coords) return;

      // Check if clicking inside existing crop area -> move mode
      const insideCrop =
        coords.x >= cropX &&
        coords.x <= cropX + cropW &&
        coords.y >= cropY &&
        coords.y <= cropY + cropH;

      if (insideCrop) {
        setDragMode("move");
        setDragStart(coords);
        setDragCropOrigin({ x: cropX, y: cropY, w: cropW, h: cropH });
      } else {
        // Clicking outside -> draw new crop area
        setDragMode("draw");
        setDragStart(coords);
        setCropX(coords.x);
        setCropY(coords.y);
        setCropW(1);
        setCropH(1);
      }
      setIsDragging(true);
    },
    [getImageCoords, cropX, cropY, cropW, cropH],
  );

  // M6: Handle mouse move during drag
  useEffect(() => {
    if (!isDragging || !dragStart) return;

    const handleMouseMove = (e: MouseEvent) => {
      const coords = getImageCoords(e);
      if (!coords) return;

      if (dragMode === "move" && dragCropOrigin) {
        // Move the crop area
        const dx = coords.x - dragStart.x;
        const dy = coords.y - dragStart.y;
        const newX = Math.max(0, Math.min(dragCropOrigin.x + dx, imageWidth - dragCropOrigin.w));
        const newY = Math.max(0, Math.min(dragCropOrigin.y + dy, imageHeight - dragCropOrigin.h));
        setCropX(newX);
        setCropY(newY);
      } else if (dragMode === "draw") {
        // Draw new crop area from drag start to current position
        const x1 = Math.min(dragStart.x, coords.x);
        const y1 = Math.min(dragStart.y, coords.y);
        const x2 = Math.max(dragStart.x, coords.x);
        const y2 = Math.max(dragStart.y, coords.y);

        // Clamp to image bounds
        const newX = Math.max(0, x1);
        const newY = Math.max(0, y1);
        const newW = Math.max(1, Math.min(x2 - newX, imageWidth - newX));
        const newH = Math.max(1, Math.min(y2 - newY, imageHeight - newY));

        // Apply aspect ratio constraint if active
        const ratio = ASPECT_RATIOS[aspectPreset];
        if (ratio !== null) {
          if (newW / newH > ratio) {
            setCropW(Math.round(newH * ratio));
            setCropH(newH);
          } else {
            setCropW(newW);
            setCropH(Math.round(newW / ratio));
          }
        } else {
          setCropW(newW);
          setCropH(newH);
        }
        setCropX(newX);
        setCropY(newY);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setDragMode(null);
      setDragStart(null);
      setDragCropOrigin(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragStart, dragMode, dragCropOrigin, getImageCoords, imageWidth, imageHeight, aspectPreset]);

  const handleAspectChange = useCallback(
    (preset: AspectPreset) => {
      setAspectPreset(preset);
      const ratio = ASPECT_RATIOS[preset];
      if (ratio === null) return; // free mode

      // Adjust crop to match aspect ratio, centered in current selection
      const centerX = cropX + cropW / 2;
      const centerY = cropY + cropH / 2;

      let newW: number;
      let newH: number;

      if (cropW / cropH > ratio) {
        // Too wide, reduce width
        newH = cropH;
        newW = Math.round(cropH * ratio);
      } else {
        // Too tall, reduce height
        newW = cropW;
        newH = Math.round(cropW / ratio);
      }

      // Clamp to image bounds
      newW = Math.min(newW, imageWidth);
      newH = Math.min(newH, imageHeight);

      let newX = Math.round(centerX - newW / 2);
      let newY = Math.round(centerY - newH / 2);

      // Keep within bounds
      newX = Math.max(0, Math.min(newX, imageWidth - newW));
      newY = Math.max(0, Math.min(newY, imageHeight - newH));

      setCropX(newX);
      setCropY(newY);
      setCropW(newW);
      setCropH(newH);
    },
    [cropX, cropY, cropW, cropH, imageWidth, imageHeight],
  );

  const handleApply = useCallback(() => {
    onApply({
      x: Math.round(cropX),
      y: Math.round(cropY),
      width: Math.round(cropW),
      height: Math.round(cropH),
    });
  }, [cropX, cropY, cropW, cropH, onApply]);

  const displayWidth = imageWidth * displayScale;
  const displayHeight = imageHeight * displayScale;

  return (
    <div className="w-full" ref={containerRef}>
      {/* Aspect Ratio Presets */}
      <div className="flex items-center gap-1 mb-3">
        <span className="text-[10px] text-muted-foreground mr-2">
          Aspect Ratio:
        </span>
        {(Object.keys(ASPECT_RATIOS) as AspectPreset[]).map((preset) => (
          <Button
            key={preset}
            variant={aspectPreset === preset ? "secondary" : "ghost"}
            size="xs"
            onClick={() => handleAspectChange(preset)}
          >
            {preset === "free" ? "Free" : preset}
          </Button>
        ))}
      </div>

      {/* Image with Crop Overlay (M6: interactive mouse drag) */}
      <div
        className={cn(
          "relative inline-block select-none",
          isDragging ? "cursor-grabbing" : "cursor-crosshair",
        )}
        style={{ width: displayWidth, height: displayHeight }}
        onMouseDown={handleMouseDown}
      >
        <img
          src={imageUrl}
          alt="Crop preview"
          className="block"
          style={{ width: displayWidth, height: displayHeight }}
        />

        {/* Dim overlay outside crop area */}
        <div
          className="absolute inset-0 bg-black/50 pointer-events-none"
          style={{
            clipPath: `polygon(
              0 0, 100% 0, 100% 100%, 0 100%, 0 0,
              ${(cropX / imageWidth) * 100}% ${(cropY / imageHeight) * 100}%,
              ${(cropX / imageWidth) * 100}% ${((cropY + cropH) / imageHeight) * 100}%,
              ${((cropX + cropW) / imageWidth) * 100}% ${((cropY + cropH) / imageHeight) * 100}%,
              ${((cropX + cropW) / imageWidth) * 100}% ${(cropY / imageHeight) * 100}%,
              ${(cropX / imageWidth) * 100}% ${(cropY / imageHeight) * 100}%
            )`,
          }}
        />

        {/* Crop selection border (pointer-events-auto so mouse events register for move) */}
        <div
          className={cn(
            "absolute border-2 border-white",
            isDragging ? "pointer-events-none" : "cursor-grab",
          )}
          style={{
            left: cropX * displayScale,
            top: cropY * displayScale,
            width: cropW * displayScale,
            height: cropH * displayScale,
          }}
        >
          {/* Rule of thirds grid */}
          <div className="absolute inset-0">
            <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/30" />
            <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/30" />
            <div className="absolute top-1/3 left-0 right-0 h-px bg-white/30" />
            <div className="absolute top-2/3 left-0 right-0 h-px bg-white/30" />
          </div>
        </div>
      </div>

      {/* Numeric Inputs */}
      <div className="flex items-end gap-3 mt-3">
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">
            X
          </label>
          <input
            type="number"
            value={Math.round(cropX)}
            onChange={(e) =>
              setCropX(
                Math.max(
                  0,
                  Math.min(parseInt(e.target.value) || 0, imageWidth - cropW),
                ),
              )
            }
            className="w-16 border border-border bg-background px-2 py-1 text-xs rounded-none"
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">
            Y
          </label>
          <input
            type="number"
            value={Math.round(cropY)}
            onChange={(e) =>
              setCropY(
                Math.max(
                  0,
                  Math.min(parseInt(e.target.value) || 0, imageHeight - cropH),
                ),
              )
            }
            className="w-16 border border-border bg-background px-2 py-1 text-xs rounded-none"
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">
            Width
          </label>
          <input
            type="number"
            value={Math.round(cropW)}
            onChange={(e) =>
              setCropW(
                Math.max(
                  1,
                  Math.min(
                    parseInt(e.target.value) || 1,
                    imageWidth - cropX,
                  ),
                ),
              )
            }
            className="w-16 border border-border bg-background px-2 py-1 text-xs rounded-none"
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">
            Height
          </label>
          <input
            type="number"
            value={Math.round(cropH)}
            onChange={(e) =>
              setCropH(
                Math.max(
                  1,
                  Math.min(
                    parseInt(e.target.value) || 1,
                    imageHeight - cropY,
                  ),
                ),
              )
            }
            className="w-16 border border-border bg-background px-2 py-1 text-xs rounded-none"
          />
        </div>
        <div className="flex-1" />
        <Button variant="ghost" size="xs" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="xs" onClick={handleApply} disabled={isProcessing}>
          Apply Crop
        </Button>
      </div>
    </div>
  );
}
