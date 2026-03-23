/**
 * Inline Image Editor
 *
 * Provides image editing tools: Crop, Rotate CW/CCW, Flip H/V, Scale.
 * Renders inline on the Edit Media page (NOT in a modal).
 *
 * Phase 2 Note: Server-side processing via Sharp is stubbed.
 * This component provides the UI for crop selection and edit controls.
 * When the user applies changes, it calls the appropriate Convex action
 * which will perform the actual processing when Sharp is available.
 */

import { useState, useCallback } from "react";
import {
  CropIcon,
  FlipHorizontalIcon,
  FlipVerticalIcon,
  RotateCcwIcon,
  RotateCwIcon,
  ScaleIcon,
  UndoIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useAction } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";

import { Button } from "@/components/ui/button";
import { CropTool } from "@/components/media/CropTool";

interface ImageEditorProps {
  mediaId: Id<"media">;
  imageUrl: string;
  width: number;
  height: number;
  onClose: () => void;
}

type EditorMode = "none" | "crop" | "scale";

export function ImageEditor({
  mediaId,
  imageUrl,
  width,
  height,
  onClose,
}: ImageEditorProps) {
  const [mode, setMode] = useState<EditorMode>("none");
  const [isProcessing, setIsProcessing] = useState(false);
  const [scaleWidth, setScaleWidth] = useState(width);
  const [scaleHeight, setScaleHeight] = useState(height);
  const [lockAspect, setLockAspect] = useState(true);

  const cropAction = useAction(api.media.actions.crop);
  const rotateAction = useAction(api.media.actions.rotate);
  const flipAction = useAction(api.media.actions.flip);
  const scaleAction = useAction(api.media.actions.scale);
  const revertAction = useAction(api.media.actions.revert);

  const aspectRatio = width / height;

  const handleRotate = useCallback(
    async (degrees: 90 | 180 | 270) => {
      setIsProcessing(true);
      try {
        await rotateAction({ mediaId, degrees });
        toast.success(`Image rotated ${degrees} degrees.`);
      } catch (err) {
        toast.error(
          `Rotation failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      } finally {
        setIsProcessing(false);
      }
    },
    [mediaId, rotateAction],
  );

  const handleFlip = useCallback(
    async (direction: "horizontal" | "vertical") => {
      setIsProcessing(true);
      try {
        await flipAction({ mediaId, direction });
        toast.success(`Image flipped ${direction}ly.`);
      } catch (err) {
        toast.error(
          `Flip failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      } finally {
        setIsProcessing(false);
      }
    },
    [mediaId, flipAction],
  );

  const handleCrop = useCallback(
    async (cropData: { x: number; y: number; width: number; height: number }) => {
      setIsProcessing(true);
      try {
        await cropAction({
          mediaId,
          cropData,
          applyToSizes: "all",
        });
        toast.success("Image cropped successfully.");
        setMode("none");
      } catch (err) {
        toast.error(
          `Crop failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      } finally {
        setIsProcessing(false);
      }
    },
    [mediaId, cropAction],
  );

  const handleScale = useCallback(async () => {
    setIsProcessing(true);
    try {
      await scaleAction({
        mediaId,
        width: scaleWidth,
        height: scaleHeight,
      });
      toast.success("Image scaled successfully.");
      setMode("none");
    } catch (err) {
      toast.error(
        `Scale failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setIsProcessing(false);
    }
  }, [mediaId, scaleWidth, scaleHeight, scaleAction]);

  const handleRevert = useCallback(async () => {
    setIsProcessing(true);
    try {
      await revertAction({ mediaId });
      toast.success("Image reverted to original.");
    } catch (err) {
      toast.error(
        `Revert failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setIsProcessing(false);
    }
  }, [mediaId, revertAction]);

  const handleScaleWidthChange = (newWidth: number) => {
    setScaleWidth(newWidth);
    if (lockAspect) {
      setScaleHeight(Math.round(newWidth / aspectRatio));
    }
  };

  const handleScaleHeightChange = (newHeight: number) => {
    setScaleHeight(newHeight);
    if (lockAspect) {
      setScaleWidth(Math.round(newHeight * aspectRatio));
    }
  };

  return (
    <div className="border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Edit Image</h3>
        <Button variant="ghost" size="icon-xs" onClick={onClose}>
          <XIcon className="size-4" />
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 mb-4 flex-wrap">
        <Button
          variant={mode === "crop" ? "secondary" : "outline"}
          size="xs"
          onClick={() => setMode(mode === "crop" ? "none" : "crop")}
          disabled={isProcessing}
        >
          <CropIcon className="size-3 mr-1" />
          Crop
        </Button>
        <Button
          variant="outline"
          size="xs"
          onClick={() => handleRotate(270)}
          disabled={isProcessing}
        >
          <RotateCcwIcon className="size-3 mr-1" />
          Rotate Left
        </Button>
        <Button
          variant="outline"
          size="xs"
          onClick={() => handleRotate(90)}
          disabled={isProcessing}
        >
          <RotateCwIcon className="size-3 mr-1" />
          Rotate Right
        </Button>
        <Button
          variant="outline"
          size="xs"
          onClick={() => handleFlip("horizontal")}
          disabled={isProcessing}
        >
          <FlipHorizontalIcon className="size-3 mr-1" />
          Flip H
        </Button>
        <Button
          variant="outline"
          size="xs"
          onClick={() => handleFlip("vertical")}
          disabled={isProcessing}
        >
          <FlipVerticalIcon className="size-3 mr-1" />
          Flip V
        </Button>
        <Button
          variant={mode === "scale" ? "secondary" : "outline"}
          size="xs"
          onClick={() => setMode(mode === "scale" ? "none" : "scale")}
          disabled={isProcessing}
        >
          <ScaleIcon className="size-3 mr-1" />
          Scale
        </Button>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="xs"
          onClick={handleRevert}
          disabled={isProcessing}
        >
          <UndoIcon className="size-3 mr-1" />
          Revert to Original
        </Button>
      </div>

      {/* Canvas / Preview Area */}
      <div className="relative bg-muted/30 flex items-center justify-center min-h-[300px]">
        {mode === "crop" ? (
          <CropTool
            imageUrl={imageUrl}
            imageWidth={width}
            imageHeight={height}
            onApply={handleCrop}
            onCancel={() => setMode("none")}
            isProcessing={isProcessing}
          />
        ) : (
          <img
            src={imageUrl}
            alt="Edit preview"
            className="max-w-full max-h-[500px] object-contain"
          />
        )}

        {isProcessing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <div className="size-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          </div>
        )}
      </div>

      {/* Scale Controls */}
      {mode === "scale" && (
        <div className="mt-4 flex items-end gap-3">
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">
              Width (px)
            </label>
            <input
              type="number"
              value={scaleWidth}
              onChange={(e) =>
                handleScaleWidthChange(parseInt(e.target.value) || 0)
              }
              min={1}
              max={width}
              className="w-24 border border-border bg-background px-2 py-1 text-xs rounded-none"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">
              Height (px)
            </label>
            <input
              type="number"
              value={scaleHeight}
              onChange={(e) =>
                handleScaleHeightChange(parseInt(e.target.value) || 0)
              }
              min={1}
              max={height}
              className="w-24 border border-border bg-background px-2 py-1 text-xs rounded-none"
            />
          </div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={lockAspect}
              onChange={(e) => setLockAspect(e.target.checked)}
              className="rounded-none"
            />
            Lock aspect ratio
          </label>
          <Button size="xs" onClick={handleScale} disabled={isProcessing}>
            Apply Scale
          </Button>
        </div>
      )}
    </div>
  );
}
