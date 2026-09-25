import chunk0 from "./wordmark-hq-chunks/chunk0";
import chunk1 from "./wordmark-hq-chunks/chunk1";
import chunk2 from "./wordmark-hq-chunks/chunk2";
import chunk3 from "./wordmark-hq-chunks/chunk3";
import chunk4 from "./wordmark-hq-chunks/chunk4";
import chunk5 from "./wordmark-hq-chunks/chunk5";

type Props = { className?: string };

const ROSTA_HOME_WORDMARK_PATH = [chunk0, chunk1, chunk2, chunk3, chunk4, chunk5].join("");

export function RostaHomeWordmark({ className }: Props) {
  return (
    <svg
      viewBox="0 0 3151 1318"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
      className={className}
      shapeRendering="geometricPrecision"
    >
      <path d={ROSTA_HOME_WORDMARK_PATH} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}
