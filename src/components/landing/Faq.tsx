// Questions as disclosures: one open at a time, the first open at load.

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { FAQ as t } from '@/content/landing';

export default function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="lp-faq">
      {t.items.map((item, n) => {
        const isOpen = open === n;
        return (
          <div key={item.q} className={`lp-faq-item${isOpen ? ' lp-on' : ''}`}>
            <h3>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`lp-faq-${n}`}
                onClick={() => setOpen(isOpen ? null : n)}
              >
                {item.q}
                <Plus aria-hidden="true" />
              </button>
            </h3>
            <div className="lp-faq-body" id={`lp-faq-${n}`} role="region" hidden={!isOpen}>
              <p>{item.a}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
