import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";

export default function NotFound() {
  return (
    <section className="cr-fatal-state">
      <span><Search /></span>
      <div>
        <small>404</small>
        <h1>Bu panel sayfası bulunamadı</h1>
        <p>Bağlantı eski olabilir veya ilgili modül henüz bu adreste bulunmuyor.</p>
      </div>
      <Link className="cr-button cr-button--primary" href="/"><ArrowLeft /> Dashboard’a dön</Link>
    </section>
  );
}
