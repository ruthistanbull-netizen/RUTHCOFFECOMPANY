import type { Metadata, Viewport } from "next";
import { Cinzel, Montserrat } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CartProvider } from "@/components/CartProvider";
import { CartDrawer } from "@/components/CartDrawer";

const montserrat=Montserrat({subsets:["latin"],variable:"--font-sans",display:"swap"});
const cinzel=Cinzel({subsets:["latin"],variable:"--font-serif",display:"swap"});
export const metadata:Metadata={title:{default:"Ruth Coffee Company",template:"%s | Ruth Coffee Company"},description:"Premium coffee consulting, wholesale coffee and retail coffee by Ruth Coffee Company."};
export const viewport:Viewport={width:"device-width",initialScale:1,themeColor:"#f5efe5",viewportFit:"cover"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body className={`${montserrat.variable} ${cinzel.variable}`}><CartProvider><Header/><main>{children}</main><Footer/><CartDrawer/></CartProvider></body></html>}
