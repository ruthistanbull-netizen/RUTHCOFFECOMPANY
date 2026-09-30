import { Archivo, Oswald, Space_Mono } from "next/font/google";

const archivo = Archivo({
  subsets: ["latin", "latin-ext"],
  variable: "--studio-font-body",
  display: "swap",
});

const oswald = Oswald({
  subsets: ["latin", "latin-ext"],
  variable: "--studio-font-display",
  display: "swap",
});

const spaceMono = Space_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  variable: "--studio-font-mono",
  display: "swap",
});

export default function StudioLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`${archivo.variable} ${oswald.variable} ${spaceMono.variable}`}>
      {children}
    </div>
  );
}
