import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ivory px-6 py-32 text-center">
      <div>
        <p className="mb-4 text-xs uppercase tracking-wide-luxe text-gold-dark">404</p>
        <h1 className="font-heading" style={{ fontSize: "clamp(2.2rem, 6vw, 4.5rem)", color: "var(--ink)" }}>
          Page not found
        </h1>
        <p className="mx-auto mt-6 max-w-xl leading-8 text-muted-ruth">
          Aradığın sayfa taşınmış veya henüz oluşturulmamış olabilir.
        </p>
        <Link href="/" className="mt-8 inline-flex rounded-full bg-ink px-8 py-4 text-xs uppercase tracking-wide-luxe text-cream">
          Back to home
        </Link>
      </div>
    </div>
  );
}
