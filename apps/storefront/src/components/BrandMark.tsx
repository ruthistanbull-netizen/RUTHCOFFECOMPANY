type BrandMarkProps = {
  className?: string;
  size?: "sm" | "md" | "lg" | "hero";
  centered?: boolean;
  text?: string;
};

const sizeMap = {
  sm: "text-[1.12rem] tracking-[0.26em] md:text-[1.08rem] md:tracking-[0.30em]",
  md: "text-[1.25rem] tracking-[0.28em] md:text-[1.55rem] md:tracking-[0.32em]",
  lg: "text-[1.75rem] tracking-[0.30em] md:text-[2.7rem] md:tracking-[0.36em]",
  hero: "text-[2.8rem] tracking-[0.28em] md:text-[5.4rem] md:tracking-[0.36em]",
};

const centeredTrackingCompensation = {
  sm: "pl-[0.26em] md:pl-[0.30em]",
  md: "pl-[0.28em] md:pl-[0.32em]",
  lg: "pl-[0.30em] md:pl-[0.36em]",
  hero: "pl-[0.28em] md:pl-[0.36em]",
};

export default function BrandMark({
  className = "",
  size = "md",
  centered = false,
  text = "RUTH ISTANBUL",
}: BrandMarkProps) {
  return (
    <div className={`${centered ? "text-center" : ""} ${className}`}>
      <div
        className={`font-heading uppercase leading-none text-ink ${sizeMap[size]} ${
          centered ? centeredTrackingCompensation[size] : ""
        }`}
      >
        {text}
      </div>
    </div>
  );
}
