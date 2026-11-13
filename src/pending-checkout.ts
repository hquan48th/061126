export type CheckoutPayload = { customer: { name: string; phone: string; email: string; address: string; note: string }; items: {variantId:string;quantity:number}[]; paymentMethod:'cod'|'bank'; expectedTotal:number };
export type PendingCheckout = { key:string; createdAt:number; body:CheckoutPayload|null };
const slot='fillico-pending-checkout-v1';
const lifetime=30*60*1000;
// Per-tab storage avoids keeping customer details after closing the tab.
export function readPending(): PendingCheckout|null {
  try { const p=JSON.parse(sessionStorage.getItem(slot)||'null');
    if(!p||typeof p.key!=='string'||typeof p.createdAt!=='number')return null;
    if(Date.now()-p.createdAt>lifetime){p.body=null;sessionStorage.setItem(slot,JSON.stringify(p));}
    return p;
  } catch { return null; }
}
export function startPending(body:CheckoutPayload):PendingCheckout {
  const pending={key:crypto.randomUUID(),createdAt:Date.now(),body};
  // Persist BEFORE sending; fail visibly if storage is unavailable.
  sessionStorage.setItem(slot,JSON.stringify(pending));return pending;
}
export function clearPending(){sessionStorage.removeItem(slot);}

// Purge expired customer data even after navigating away from checkout.
if(typeof window!=='undefined')window.setInterval(readPending,10000);
