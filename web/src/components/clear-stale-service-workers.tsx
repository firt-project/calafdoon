/**
 * Unregisters leftover service workers from the removed PWA.
 * Inline in root layout (no next/script) so App Router builds stay clean.
 */
export function ClearStaleServiceWorkers() {
  const script = `(function(){try{if(!("serviceWorker"in navigator))return;navigator.serviceWorker.getRegistrations().then(function(r){var h=r&&r.length>0;return Promise.all((r||[]).map(function(x){return x.unregister()})).then(function(){return h})}).then(function(h){var c=("caches"in window)?caches.keys().then(function(k){return Promise.all(k.map(function(key){if(String(key).indexOf("hel-calafkaaga")===0)return caches.delete(key)}))}):Promise.resolve();return c.then(function(){if(h&&!sessionStorage.getItem("hel-sw-cleared")){sessionStorage.setItem("hel-sw-cleared","1");location.reload()}})})}catch(e){}})();`;

  return (
    <script
      id="hel-clear-stale-service-workers"
      dangerouslySetInnerHTML={{ __html: script }}
    />
  );
}
