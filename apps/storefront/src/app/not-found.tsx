import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-carbon px-6 py-32 text-center text-cream">
      <div>
        <p className="mb-4 text-xs uppercase tracking-wide-luxe text-brick">404</p>
        <h1 className="font-heading" style={{ fontSize: "clamp(2.2rem, 6vw, 4.5rem)", color: "var(--ink)" }}>
          Page not found
        </h1>
        <p className="mx-auto mt-6 max-w-xl leading-8 text-cream/70">
          Aradığın sayfa taşınmış veya henüz oluşturulmamış olabilir.
        </p>
        <Link href="/" className="mt-8 inline-flex rounded-full bg-brick px-8 py-4 text-xs uppercase tracking-wide-luxe text-[var(--rosta-action-text)]">
          Back to home
        </Link>
      </div>
    </div>
  );
}
