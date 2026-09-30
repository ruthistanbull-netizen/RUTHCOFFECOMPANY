import "./business-editorial.css";
import { Archivo, Oswald, Space_Mono } from "next/font/google";

const archivo = Archivo({
  subsets: ["latin", "latin-ext"],
  variable: "--studio-font-archivo",
  display: "swap",
});

const oswald = Oswald({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  variable: "--studio-font-oswald",
  display: "swap",
});

const spaceMono = Space_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  variable: "--studio-font-mono",
  display: "swap",
});

export default function BusinessEditorialLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`${archivo.variable} ${oswald.variable} ${spaceMono.variable}`}>
      {children}
    </div>
  );
}
