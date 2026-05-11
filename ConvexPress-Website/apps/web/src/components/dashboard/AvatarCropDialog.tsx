import { useState, useRef, useCallback, useEffect } from "react";
import ReactCrop, {
  type Crop,
  type PixelCrop,
  centerCrop,
  makeAspectCrop,
  convertToPixelCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

import { Loader2, Check, X, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface AvatarCropDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when dialog open state changes */
  onOpenChange: (open: boolean) => void;
  /** The source image to crop (data URL or blob URL from file input) */
  imageSrc: string;
  /** Callback receiving the cropped Blob after user confirms */
  onCropComplete: (croppedBlob: Blob) => void;
}

/** Max output dimensions for the cropped avatar */
const MAX_OUTPUT_SIZE = 500;

/** WebP quality for the output */
const OUTPUT_QUALITY = 0.85;

/**
 * Creates a maximized 1:1 crop that fills as much of the image as possible.
 */
function maxSquareCrop(
  mediaWidth: number,
  mediaHeight: number
): Crop {
  const aspect = 1;
  const mediaAspect = mediaWidth / mediaHeight;

  let cropWidth: number;

  if (mediaAspect > aspect) {
    // Image is wider than square -- constrain by height
    cropWidth = (aspect / mediaAspect) * 100;
  } else {
    // Image is taller or equal -- constrain by width
    cropWidth = 100;
  }

  return centerCrop(
    makeAspectCrop(
      {
        unit: "%",
        width: cropWidth,
      },
      aspect,
      mediaWidth,
      mediaHeight
    ),
    mediaWidth,
    mediaHeight
  );
}

/**
 * Crop the selected area from the source image, scale to max 500x500, output as WebP.
 */
async function getCroppedBlob(
  image: HTMLImageElement,
  crop: PixelCrop
): Promise<Blob> {
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;

  // Actual crop dimensions at natural resolution
  const srcX = crop.x * scaleX;
  const srcY = crop.y * scaleY;
  const srcW = crop.width * scaleX;
  const srcH = crop.height * scaleY;

  // Calculate final output size (max 500x500, maintain aspect -- but it's 1:1)
  let finalSize = Math.round(Math.min(srcW, srcH));
  if (finalSize > MAX_OUTPUT_SIZE) {
    finalSize = MAX_OUTPUT_SIZE;
  }

  const canvas = document.createElement("canvas");
  canvas.width = finalSize;
  canvas.height = finalSize;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get canvas 2d context");
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.drawImage(
    image,
    srcX,
    srcY,
    srcW,
    srcH,
    0,
    0,
    finalSize,
    finalSize
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Failed to create cropped image blob"));
        }
      },
      "image/webp",
      OUTPUT_QUALITY
    );
  });
}


/**
 * AvatarCropDialog -- modal for cropping an avatar image to a 1:1 square.
 *
 * Uses react-image-crop with a fixed 1:1 aspect ratio.
 * Outputs a WebP blob scaled to max 500x500px.
 *
 * This is a destructive-action exception dialog -- the only acceptable popup in the
 * dashboard besides delete confirmations.
 */
export function AvatarCropDialog({
  open,
  onOpenChange,
  imageSrc,
  onCropComplete,
}: AvatarCropDialogProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [isProcessing, setIsProcessing] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Reset state when dialog opens/closes or image changes
  useEffect(() => {
    if (!open) {
      setCrop(undefined);
      setCompletedCrop(undefined);
      setImageLoaded(false);
    }
  }, [open, imageSrc]);

  const onImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const { width, height } = e.currentTarget;

      // Create maximized square crop
      const initialCrop = maxSquareCrop(width, height);
      setCrop(initialCrop);

      // Set completedCrop immediately so Save works without any interaction
      const pixelCrop = convertToPixelCrop(initialCrop, width, height);
      setCompletedCrop(pixelCrop);
      setImageLoaded(true);
    },
    []
  );

  const handleCropChange = useCallback(
    (pixelCrop: PixelCrop, percentCrop: Crop) => {
      setCrop(percentCrop);
      setCompletedCrop(pixelCrop);
    },
    []
  );

  const handleMaximize = useCallback(() => {
    if (!imgRef.current) return;

    const { width, height } = imgRef.current;
    const maxCrop = maxSquareCrop(width, height);
    setCrop(maxCrop);

    const pixelCrop = convertToPixelCrop(maxCrop, width, height);
    setCompletedCrop(pixelCrop);
  }, []);

  const handleSave = useCallback(async () => {
    if (!imgRef.current || !completedCrop) return;

    // Validate crop has actual dimensions
    if (completedCrop.width <= 0 || completedCrop.height <= 0) {
      return;
    }

    setIsProcessing(true);
    try {
      const blob = await getCroppedBlob(imgRef.current, completedCrop);
      onCropComplete(blob);
      onOpenChange(false);
    } catch (error: unknown) {
      console.error("Error cropping avatar:", error);
    } finally {
      setIsProcessing(false);
    }
  }, [completedCrop, onCropComplete, onOpenChange]);

  const handleClose = useCallback(() => {
    if (!isProcessing) {
      onOpenChange(false);
    }
  }, [isProcessing, onOpenChange]);

  // Compute display dimensions for the crop info
  const cropDimensions = completedCrop && imgRef.current
    ? {
        width: Math.round(
          completedCrop.width *
            (imgRef.current.naturalWidth / imgRef.current.width)
        ),
        height: Math.round(
          completedCrop.height *
            (imgRef.current.naturalHeight / imgRef.current.height)
        ),
      }
    : null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Crop Avatar</DialogTitle>
          <DialogDescription>
            Drag to reposition. Use the handles to resize. Avatar will be
            cropped to a square.
          </DialogDescription>
        </DialogHeader>

        {/* Crop Area */}
        <div className="flex-1 overflow-hidden flex items-center justify-center bg-black/10 min-h-[250px] max-h-[55vh]">
          <ReactCrop
            crop={crop}
            onChange={handleCropChange}
            onComplete={(c) => setCompletedCrop(c)}
            aspect={1}
            circularCrop
            className="max-h-full"
            style={{ maxHeight: "100%" }}
          >
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Crop preview"
              onLoad={onImageLoad}
              style={{
                maxHeight: "55vh",
                maxWidth: "100%",
                display: "block",
              }}
              className="object-contain select-none"
              draggable={false}
            />
          </ReactCrop>
        </div>

        {/* Info bar */}
        <div className="flex items-center justify-between gap-2 pt-2">
          <Button
            variant="outline"
            size="xs"
            onClick={handleMaximize}
            disabled={!imageLoaded || isProcessing}
          >
            <Maximize2 className="size-3" />
            <span>Maximize</span>
          </Button>

          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            {cropDimensions && (
              <span>
                Source: {cropDimensions.width} x {cropDimensions.height}px
              </span>
            )}
            <span>
              Output: max {MAX_OUTPUT_SIZE}x{MAX_OUTPUT_SIZE}px, WebP
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isProcessing}
          >
            <X className="size-3.5" />
            <span>Cancel</span>
          </Button>

          <Button
            onClick={handleSave}
            disabled={isProcessing || !completedCrop || !imageLoaded}
          >
            {isProcessing ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <Check className="size-3.5" />
                <span>Save</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
