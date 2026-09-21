"use client";
import { useEffect,useRef,type Dispatch,type SetStateAction } from "react";

type Drag={x:number;y:number};

export function useProductGalleryTouch({enabled,selectedIndex,imageCount,setDragging,setDrag,setSelectedIndex,didDrag}:{enabled:boolean;selectedIndex:number;imageCount:number;setDragging:Dispatch<SetStateAction<boolean>>;setDrag:Dispatch<SetStateAction<Drag>>;setSelectedIndex:Dispatch<SetStateAction<number>>;didDrag:{current:boolean}}){
  const ref=useRef<HTMLDivElement|null>(null),active=useRef(false),startX=useRef(0),startY=useRef(0),currentY=useRef(0),axis=useRef<"x"|"y"|null>(null),consumed=useRef(false);
  useEffect(()=>{
    const element=ref.current;if(!element||!enabled)return;
    element.style.setProperty("touch-action","pan-y","important");
    element.style.setProperty("overscroll-behavior","auto","important");
    element.style.setProperty("overscroll-behavior-y","auto","important");
    const reset=()=>{active.current=false;axis.current=null;currentY.current=0;consumed.current=false;setDragging(false);setDrag({x:0,y:0})};
    const start=(event:TouchEvent)=>{
      const target=event.target,touch=event.touches[0];
      if(event.touches.length!==1||!touch||!(target instanceof Element)||!target.closest("[data-product-gallery-image-surface]")){reset();return}
      active.current=true;startX.current=touch.clientX;startY.current=touch.clientY;currentY.current=0;axis.current=null;consumed.current=false;didDrag.current=false;
    };
    const move=(event:TouchEvent)=>{
      const touch=event.touches[0];if(!active.current||event.touches.length!==1||!touch)return;
      const x=touch.clientX-startX.current,y=touch.clientY-startY.current;if(Math.abs(x)>5||Math.abs(y)>5)didDrag.current=true;
      if(!axis.current){if(Math.abs(x)<6&&Math.abs(y)<6)return;axis.current=Math.abs(x)>Math.abs(y)*1.08?"x":"y"}
      if(axis.current!=="y")return;
      const next=y<0&&selectedIndex<imageCount-1,previous=y>0&&selectedIndex>0&&window.scrollY<=1;
      if(!next&&!previous){consumed.current=false;currentY.current=0;setDragging(false);setDrag({x:0,y:0});return}
      event.preventDefault();consumed.current=true;currentY.current=y;setDragging(true);setDrag({x:0,y});
    };
    const end=()=>{
      const y=currentY.current;
      if(consumed.current&&y<=-28&&selectedIndex<imageCount-1)setSelectedIndex(value=>Math.min(value+1,imageCount-1));
      else if(consumed.current&&y>=28&&selectedIndex>0)setSelectedIndex(value=>Math.max(value-1,0));
      reset();
    };
    element.addEventListener("touchstart",start,{passive:true});element.addEventListener("touchmove",move,{passive:false});element.addEventListener("touchend",end,{passive:true});element.addEventListener("touchcancel",reset,{passive:true});
    return()=>{element.style.removeProperty("touch-action");element.style.removeProperty("overscroll-behavior");element.style.removeProperty("overscroll-behavior-y");element.removeEventListener("touchstart",start);element.removeEventListener("touchmove",move);element.removeEventListener("touchend",end);element.removeEventListener("touchcancel",reset)};
  },[didDrag,enabled,imageCount,selectedIndex,setDrag,setDragging,setSelectedIndex]);
  return ref;
}
