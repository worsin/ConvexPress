/**
 * Audio Widget - Website Renderer
 *
 * Embeds an audio player for a direct audio URL.
 * Uses loading="lazy" via preload="none" for performance.
 */

interface AudioWidgetConfig {
  audioUrl?: string;
}

export function AudioWidget({ config }: { config: AudioWidgetConfig }) {
  if (!config.audioUrl) {
    return <p className="text-sm text-muted-foreground">No audio URL provided.</p>;
  }

  return (
    <audio
      src={config.audioUrl}
      controls
      preload="none"
      className="w-full"
    >
      Your browser does not support the audio element.
    </audio>
  );
}
