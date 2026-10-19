"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WatchEvent, WatchSession, WatchSnapshot } from "@/lib/entertainment/model";
type Send = (recipientId: string, kind: "offer" | "answer" | "ice", body: Record<string, unknown>) => Promise<void>;
export function useScreenShare(session: WatchSession | null, snapshot: WatchSnapshot | null, send: Send,
  setSharing: (active: boolean) => Promise<void>, onError: (message: string) => void) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [receiving, setReceiving] = useState<MediaStream | null>(null);
  const local = useRef<MediaStream | null>(null);
  const starting = useRef(false);
  const previousShare = useRef<string | null>(null);
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const candidates = useRef(new Map<string, RTCIceCandidateInit[]>());
  const outgoing = useRef(Promise.resolve());
  const latest = useRef({ session, snapshot, send, setSharing, onError });
  latest.current = { session, snapshot, send, setSharing, onError };
  const closePeers = useCallback(() => {
    peers.current.forEach((peer) => peer.close()); peers.current.clear(); candidates.current.clear();
  }, []);
  const stopLocal = useCallback(() => {
    local.current?.getTracks().forEach((track) => { track.onended = null; track.stop(); });
    local.current = null; setStream(null); closePeers();
  }, [closePeers]);
  const stop = useCallback(async () => {
    stopLocal();
    try { await latest.current.setSharing(false); } catch (e) { latest.current.onError((e as Error).message); }
  }, [stopLocal]);
  function queuedSend(id: string, kind: "offer" | "answer" | "ice", body: Record<string, unknown>) {
    outgoing.current = outgoing.current.then(() => latest.current.send(id, kind, body)).catch((e) => latest.current.onError((e as Error).message));
    return outgoing.current;
  }
  function peerFor(id: string) {
    const existing = peers.current.get(id); if (existing) return existing;
    const peer = new RTCPeerConnection({ iceServers: latest.current.snapshot?.iceServers || [] });
    peers.current.set(id, peer);
    peer.onicecandidate = ({ candidate }) => { if (candidate) void queuedSend(id, "ice", candidate.toJSON() as unknown as Record<string, unknown>); };
    peer.ontrack = (event) => { setReceiving(event.streams[0] || new MediaStream([event.track])); };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "failed") {
        latest.current.onError("Sekme paylaşım bağlantısı kurulamadı. Farklı bir ağda tekrar dene; kısıtlı ağlar için sunucuda TURN bağlantısı gerekir.");
        peer.close(); peers.current.delete(id);
      }
    };
    return peer;
  }
  const handleEvent = useCallback(async (event: WatchEvent) => {
    const current = latest.current;
    if (!current.session || event.kind === "chat") return;
    if (event.kind === "ready") {
      if (current.snapshot?.room.sharing_member !== current.session.member.id) return;
      peers.current.get(event.sender_id)?.close(); peers.current.delete(event.sender_id);
      return;
    }
    if (event.kind === "offer") {
      if (current.session.member.role !== "guest" || current.snapshot?.room.sharing_member !== event.sender_id) return;
      peers.current.get(event.sender_id)?.close(); peers.current.delete(event.sender_id);
      const peer = peerFor(event.sender_id);
      await peer.setRemoteDescription({ type: "offer", sdp: String(event.body.sdp) });
      for (const candidate of candidates.current.get(event.sender_id) || []) await peer.addIceCandidate(candidate);
      candidates.current.delete(event.sender_id);
      const answer = await peer.createAnswer(); await peer.setLocalDescription(answer);
      await queuedSend(event.sender_id, "answer", { type: "answer", sdp: answer.sdp });
    } else if (event.kind === "answer") {
      const peer = peers.current.get(event.sender_id);
      if (!peer || peer.signalingState !== "have-local-offer") return;
      await peer.setRemoteDescription({ type: "answer", sdp: String(event.body.sdp) });
      for (const candidate of candidates.current.get(event.sender_id) || []) await peer.addIceCandidate(candidate);
      candidates.current.delete(event.sender_id);
    } else if (event.kind === "ice") {
      const peer = peers.current.get(event.sender_id);
      const candidate = event.body as RTCIceCandidateInit;
      if (peer?.remoteDescription) await peer.addIceCandidate(candidate);
      else candidates.current.set(event.sender_id, [...(candidates.current.get(event.sender_id) || []), candidate]);
    }
  }, []);
  useEffect(() => {
    if (!session) { closePeers(); stopLocal(); setReceiving(null); return; }
    if (!snapshot) return;
    const sharing = snapshot.room.sharing_member;
    if (sharing !== previousShare.current) { closePeers(); setReceiving(null); previousShare.current = sharing; }
    if (!sharing) { closePeers(); setReceiving(null); if (local.current && !starting.current) stopLocal(); return; }
    if (sharing !== session.member.id) { if (local.current) stopLocal(); return; }
    if (!local.current) return;
    const ids = new Set(snapshot.members.filter((member) => member.role === "guest").map((member) => member.id));
    for (const [id, peer] of peers.current) if (!ids.has(id)) { peer.close(); peers.current.delete(id); }
    for (const id of ids) {
      if (peers.current.has(id)) continue;
      const peer = peerFor(id);
      local.current.getTracks().forEach((track) => peer.addTrack(track, local.current!));
      void (async () => {
        try { const offer = await peer.createOffer(); await peer.setLocalDescription(offer); await queuedSend(id, "offer", { type: "offer", sdp: offer.sdp }); }
        catch (e) { latest.current.onError((e as Error).message); peer.close(); peers.current.delete(id); }
      })();
    }
  }, [session, snapshot, closePeers, stopLocal]);
  useEffect(() => () => { local.current?.getTracks().forEach((track) => track.stop()); closePeers(); }, [closePeers]);
  async function start() {
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("Sekme paylaşımını bilgisayarda Chrome veya Edge ile başlat. Telefonda davet linkiyle izleyebilirsin.");
    if (local.current) return;
    const captured = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
    starting.current = true;
    local.current = captured; setStream(captured);
    try {
      await latest.current.setSharing(true);
      captured.getVideoTracks()[0].onended = () => { void stop(); };
      if (!captured.getAudioTracks().length) latest.current.onError("Görüntü paylaşılıyor fakat ses seçilmedi. Paylaşımı durdurup bir sekme seçerek Sekme sesini paylaş kutusunu işaretle.");
    } catch (e) { stopLocal(); throw e; }
    finally { starting.current = false; }
  }
  return { stream, receiving, start, stop, handleEvent };
}
