"use client";

import { Minus, Plus } from "lucide-react";
import { useState } from "react";

export type FaqItem = {
  question: string;
  answer: string;
};

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openItems, setOpenItems] = useState<Set<number>>(() => new Set([0, 1, 2]));

  const toggle = (index: number) => {
    setOpenItems((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <div className="faq-list">
      {items.map((item, index) => {
        const isOpen = openItems.has(index);
        return (
          <section key={item.question} className={`faq-item ${isOpen ? "is-open" : ""}`}>
            <button
              type="button"
              className="faq-question"
              onClick={() => toggle(index)}
              aria-expanded={isOpen}
            >
              <span className="faq-symbol" aria-hidden="true">
                {isOpen ? <Minus size={17} strokeWidth={1.5} /> : <Plus size={17} strokeWidth={1.5} />}
              </span>
              <span>{item.question}</span>
            </button>
            {isOpen ? <p className="faq-answer">{item.answer}</p> : null}
          </section>
        );
      })}
    </div>
  );
}
