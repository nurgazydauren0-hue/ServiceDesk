import { Check, Headset, MessageSquare, Plus, Ticket } from 'lucide-react';
import './support-scene.css';

export default function SupportScene() {
  return (
    <div className="support-scene" aria-hidden="true">
      <div className="support-scene-glow" />
      <svg className="scene-connections" viewBox="0 0 360 280" fill="none">
        <path d="M45 180 125 220 303 121M88 62 185 111 306 48M185 111v95M45 180V121l81-43" />
        <circle cx="45" cy="180" r="4" /><circle cx="306" cy="48" r="4" />
        <circle cx="125" cy="220" r="4" /><circle cx="88" cy="62" r="4" />
      </svg>
      <div className="scene-platform scene-platform-bottom" />
      <div className="scene-platform" />
      <div className="scene-orbit" />
      <div className="scene-ticket scene-ticket-back">
        <span className="scene-ticket-symbol"><Ticket size={18} /></span>
        <span className="scene-ticket-line" /><span className="scene-ticket-line short" />
        <div className="scene-mini-progress"><i /><i /><i /></div>
      </div>
      <div className="scene-hub-shadow" />
      <div className="scene-hub"><Headset size={49} strokeWidth={1.8} /><span>SUPPORT</span></div>
      <div className="scene-ticket scene-ticket-front">
        <span className="scene-ticket-symbol"><Ticket size={18} /><i /></span>
        <span className="scene-ticket-line" /><span className="scene-ticket-line short" />
        <span className="scene-complete"><Check size={13} /><i /><i /><i /></span>
      </div>
      <div className="scene-bubble scene-message"><MessageSquare size={22} /></div>
      <div className="scene-bubble scene-check"><Check size={25} strokeWidth={2.5} /></div>
      <div className="scene-bubble scene-plus"><Plus size={18} /></div>
      <span className="scene-spark spark-one" /><span className="scene-spark spark-two" />
    </div>
  );
}
