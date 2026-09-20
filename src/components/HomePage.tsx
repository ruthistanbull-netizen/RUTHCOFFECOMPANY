"use client";
import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowDown, ArrowRight, Check } from "lucide-react";
import { coffeeProducts, services } from "@/data/coffee";
import { ProductCard } from "./ProductCard";
import { Reveal } from "./Reveal";

export function HomePage(){
  const {scrollYProgress}=useScroll();
  const heroScale=useTransform(scrollYProgress,[0,.25],[1,1.07]);
  const heroY=useTransform(scrollYProgress,[0,.25],[0,70]);
  return <>
    <section className="hero-section">
      <motion.div className="hero-media" style={{scale:heroScale,y:heroY}}><img src="/images/coffee-hero.webp" alt="Ruth Coffee Company"/></motion.div>
      <div className="hero-shade"/>
      <div className="hero-content">
        <motion.span className="eyebrow light" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{delay:.16,duration:.7}}>RUTH COFFEE COMPANY · ISTANBUL</motion.span>
        <h1><span className="line-mask"><motion.span initial={{y:"105%"}} animate={{y:0}} transition={{delay:.14,duration:.82,ease:[.22,1,.36,1]}}>Coffee, considered</motion.span></span><span className="line-mask"><motion.span initial={{y:"105%"}} animate={{y:0}} transition={{delay:.24,duration:.82,ease:[.22,1,.36,1]}}>from every angle.</motion.span></span></h1>
        <motion.p initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} transition={{delay:.62,duration:.7}}>From the coffee in the cup to the system behind the bar.</motion.p>
        <motion.div className="hero-actions" initial={{opacity:0,y:14}} animate={{opacity:1,y:0}} transition={{delay:.74,duration:.65}}><Link className="button-light" href="/book">BOOK A CONSULTATION</Link><Link className="button-ghost-light" href="/shop">EXPLORE OUR COFFEE <ArrowRight size={15}/></Link></motion.div>
      </div>
      <a className="scroll-cue" href="#business"><ArrowDown size={16}/><span>SCROLL</span></a>
    </section>

    <section id="business" className="business-intro section-pad">
      <div className="split-copy"><Reveal><span className="eyebrow">FOR BUSINESSES</span><h2>We build better<br/>coffee operations.</h2></Reveal><Reveal delay={.08} className="split-body"><p>Ruth Coffee works with cafés, restaurants, hotels and companies from the first idea to daily service. Bean selection, recipes, workflow, training and wholesale supply live in one relationship.</p><Link className="text-link" href="/consulting">DISCOVER CONSULTING <ArrowRight size={15}/></Link></Reveal></div>
      <Reveal className="wide-photo"><img src="/images/coffee-consulting.webp" alt="Coffee consulting"/><div className="photo-caption"><span>01 / CONSULTING</span><span>BAR · MENU · COFFEE · SYSTEM</span></div></Reveal>
    </section>

    <section className="services-section section-pad" id="services"><div className="section-heading"><Reveal><span className="eyebrow">WHAT WE DO</span><h2>Built around the way<br/>your business actually works.</h2></Reveal><Reveal delay={.08}><p>Strategy becomes practical only when it works behind the bar. Every service is connected to consistency, speed and the cup.</p></Reveal></div><div className="service-list">{services.map(([no,title,copy],i)=><motion.div className="service-row" key={title} initial={{opacity:0,y:12}} whileInView={{opacity:1,y:0}} viewport={{once:true}} transition={{delay:i*.035,duration:.5}}><span>{no}</span><h3>{title}</h3><p>{copy}</p><ArrowRight size={18}/></motion.div>)}</div></section>

    <section className="tasting-section"><div className="tasting-image"><img src="/images/coffee-tasting.webp" alt="Ruth Coffee tasting"/></div><div className="tasting-copy"><Reveal><span className="eyebrow light">TASTING / B2B</span><h2>Taste before<br/>you decide.</h2><p>When booking a consultation, add a Ruth Coffee tasting to the same request. We arrive with the coffee and evaluate it in the context of your business.</p><ul><li><Check size={15}/> Espresso and filter options</li><li><Check size={15}/> Notes linked to your consultation</li><li><Check size={15}/> No separate request flow</li></ul><Link className="button-light" href="/book">BOOK A CONSULTATION</Link></Reveal></div></section>

    <section className="shop-home section-pad"><div className="section-heading compact"><Reveal><span className="eyebrow">OUR COFFEE</span><h2>Roasted with purpose.</h2></Reveal><Reveal><Link className="text-link" href="/shop">SHOP ALL COFFEE <ArrowRight size={15}/></Link></Reveal></div><div className="product-grid home-grid">{coffeeProducts.map((p,i)=><ProductCard product={p} index={i} key={p.id}/>)}</div></section>

    <section className="manifesto-section"><div className="manifesto-photo"><img src="/images/coffee-wholesale.webp" alt="Ruth Coffee wholesale"/></div><div className="manifesto-copy"><Reveal><span className="eyebrow light">THE RUTH APPROACH</span><blockquote>Selected with intention.<br/>Brewed with precision.<br/>Served consistently.</blockquote><p>Good coffee is not one decision. It is a chain of decisions that still work on the busiest hour of the day.</p></Reveal></div></section>

    <section className="process section-pad"><Reveal><span className="eyebrow">HOW B2B WORKS</span><h2>One clear path from<br/>conversation to service.</h2></Reveal><div className="process-grid">{[["01","Book a consultation"],["02","Tell us about your business"],["03","Add a Ruth tasting"],["04","Meet & analyse"],["05","Receive your solution"],["06","Start with Ruth Coffee"]].map(([no,title])=><div className="process-step" key={no}><span>{no}</span><div className="process-line"/><h3>{title}</h3></div>)}</div></section>

    <section className="final-cta"><Reveal><span className="eyebrow light">RUTH COFFEE COMPANY</span><h2>Let&apos;s build<br/>better coffee.</h2><p>For new cafés, existing operations and businesses looking for a stronger coffee program.</p><div><Link className="button-light" href="/book">BOOK A CONSULTATION</Link><Link className="button-ghost-light" href="/contact">CONTACT RUTH <ArrowRight size={15}/></Link></div></Reveal></section>
  </>;
}
