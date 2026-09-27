import type { ReactNode } from "react";
import { AnimatedBlock, PageIntro } from "@/components/PageIntro";

export type LegalSection = {
  title: string;
  content: ReactNode;
};

export function LegalDocument({
  title,
  description,
  sections,
  updated = "15 Temmuz 2026",
}: {
  title: string;
  description: string;
  sections: LegalSection[];
  updated?: string;
}) {
  return (
    <div className="min-h-screen bg-carbon px-4 pb-24 pt-32 text-cream md:px-8">
      <div className="mx-auto max-w-5xl">
        <PageIntro eyebrow="ROSTA Coffee" title={title} description={description} align="left" />
        <p className="mt-5 text-xs uppercase tracking-wide-luxe text-cream/70">Son güncelleme: {updated}</p>
        <div className="mt-10 grid gap-6">
          {sections.map((section, index) => (
            <AnimatedBlock key={section.title} delay={0.08 + index * 0.04}>
              <section className="rounded-2xl border border-kraft/35 bg-carbon-soft p-6 md:p-8">
                <h2 className="font-heading text-2xl md:text-3xl">{section.title}</h2>
                <div className="legal-copy mt-4 space-y-4 text-sm leading-7 text-cream/70 md:text-base md:leading-8">
                  {section.content}
                </div>
              </section>
            </AnimatedBlock>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LegalList({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5">{children}</ul>;
}
