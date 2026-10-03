(()=>{'use strict';const $=id=>document.getElementById(id);const state={origin:null,destination:null,mode:'car',route:null,selectTarget:'destination',markers:{origin:null,destination:null},searchAbort:null,cityContext:null,nearbyTransit:null,activeTransitRelation:null,transitStopMarkers:[]};let map;

const TRANSPORT_TYPES=[
{id:'bus',name:'Автобусы',group:'Городской транспорт',color:'#4da3ff',source:'GTFS-RT'},
{id:'trolleybus',name:'Троллейбусы',group:'Городской транспорт',color:'#49d17d',source:'GTFS-RT'},
{id:'tram',name:'Трамваи',group:'Городской транспорт',color:'#ff6f91',source:'GTFS-RT'},
{id:'minibus',name:'Маршрутки',group:'Городской транспорт',color:'#ffb84d',source:'оператор / GTFS-RT'},
{id:'metro',name:'Метро',group:'Рельсовый транспорт',color:'#8f7cff',source:'GTFS-RT'},
{id:'train',name:'Поезда',group:'Рельсовый транспорт',color:'#e5e7eb',source:'GTFS-RT / оператор'},
{id:'suburban',name:'Электрички',group:'Рельсовый транспорт',color:'#55d6be',source:'GTFS-RT / оператор'},
{id:'monorail',name:'Монорельс',group:'Рельсовый транспорт',color:'#c184ff',source:'GTFS-RT'},
{id:'funicular',name:'Фуникулёр',group:'Рельсовый транспорт',color:'#f28c52',source:'GTFS-RT'},
{id:'cablecar',name:'Канатная дорога',group:'Рельсовый транспорт',color:'#f0d45e',source:'GTFS-RT'},
{id:'ferry',name:'Паромы',group:'Вода и воздух',color:'#4ecdc4',source:'GTFS-RT / AIS'},
{id:'ship',name:'Суда',group:'Вода и воздух',color:'#43b5e8',source:'AIS'},
{id:'airplane',name:'Самолёты',group:'Вода и воздух',color:'#b6c8ff',source:'ADS-B'},
{id:'helicopter',name:'Вертолёты',group:'Вода и воздух',color:'#ff8aa8',source:'ADS-B'},
{id:'scooter',name:'Самокаты',group:'Шеринг и сервисы',color:'#92e34f',source:'GBFS / сервис'},
{id:'bikeshare',name:'Велошеринг',group:'Шеринг и сервисы',color:'#40d6a5',source:'GBFS'},
{id:'carshare',name:'Каршеринг',group:'Шеринг и сервисы',color:'#ff7a59',source:'API сервиса'},
{id:'taxi',name:'Такси',group:'Шеринг и сервисы',color:'#ffd54f',source:'API сервиса'}
];
const transportPrefs=(()=>{try{return JSON.parse(localStorage.getItem('rokin.transport.layers')||'{}')}catch{return{}}})();
const transportSchema=Number(localStorage.getItem('rokin.transport.schema')||0);
if(transportSchema<2){transportPrefs.airplane=true;transportPrefs.helicopter=true;try{localStorage.setItem('rokin.transport.schema','2');localStorage.setItem('rokin.transport.layers',JSON.stringify(transportPrefs))}catch{}}
const transportLiveCounts={airplane:0,helicopter:0};
let transportLastError='';
let transportLastUpdate=0;
let transportTimer=null;
let transportMoveTimer=null;
let lastAircraftVehicles=[];
let lastAircraftProvider='';
let nearestHintShown=false;
let liveRequestInFlight=false;
let liveRequestStartedAt=0;
let liveRequestLastAt=0;
let liveRequestWatchdog=null;
const transportMarkers=new Map();
function transportIcon(id){
const p={
bus:'<rect x="4" y="4" width="16" height="14" rx="3"/><path d="M6 9h12M7 18v2M17 18v2M7.5 14h.01M16.5 14h.01"/>',
trolleybus:'<rect x="4" y="7" width="16" height="11" rx="3"/><path d="M6 11h12M7 18v2M17 18v2M8 7l3-4M16 7l-3-4M11 3h5"/>',
tram:'<path d="M7 3h10l2 3v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6l2-3Z"/><path d="M7 9h10M8 15h.01M16 15h.01M8 22l2-3M16 22l-2-3M9 3l3-2 3 2"/>',
minibus:'<path d="M4 9l2-4h9l4 5v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9Z"/><path d="M7 7h7l2 3H5M7 19v2M16 19v2"/>',
metro:'<circle cx="12" cy="12" r="9"/><path d="M7 16V8l5 5 5-5v8"/>',
train:'<path d="M7 3h10a2 2 0 0 1 2 2v11a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2Z"/><path d="M7 9h10M8 15h.01M16 15h.01M8 22l3-3M16 22l-3-3"/>',
suburban:'<path d="M6 4h12l1 3v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7l1-3Z"/><path d="M7 10h10M8 15h.01M16 15h.01M10 22h4M12 5l-2 4h3l-2 4"/>',
monorail:'<path d="M5 7a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V7Z"/><path d="M7 10h10M12 17v5M8 22h8"/>',
funicular:'<path d="M6 16 15 5l4 3-9 11-4-3Z"/><path d="M9 12l4 3M3 20 21 4"/>',
cablecar:'<path d="M3 5h18M12 5v4"/><rect x="7" y="9" width="10" height="9" rx="2"/><path d="M9 18v2M15 18v2"/>',
ferry:'<path d="M4 14h16l-2 5H6l-2-5Z"/><path d="M8 14V8h8v6M10 8V5h4v3M3 21c2 1 4 1 6 0s4-1 6 0 4 1 6 0"/>',
ship:'<path d="M3 15h18l-3 5H7l-4-5Z"/><path d="M7 15V9h10v6M10 9V5h5l2 4M12 5V3"/>',
airplane:'<path d="m2 16 20-9-7 14-3-6-5 4 1-6-6 3Z"/>',
helicopter:'<path d="M8 10h8a4 4 0 0 1 4 4v2H9a5 5 0 0 1-5-5h4v-1Z"/><path d="M12 10V6M5 6h14M16 16l3 4M7 20h13"/>',
scooter:'<circle cx="7" cy="19" r="2"/><circle cx="18" cy="19" r="2"/><path d="M7 19h7l3-11h-4M17 8V4h3M10 15h5"/>',
bikeshare:'<circle cx="6" cy="17" r="4"/><circle cx="18" cy="17" r="4"/><path d="m6 17 4-8 4 8H6Zm4-8h5M14 17l3-9M15 8h3"/>',
carshare:'<path d="M5 9l2-4h10l2 4 2 2v6H3v-6l2-2Z"/><path d="M5 17v2M19 17v2M7 12h.01M17 12h.01M6 9h12"/><path d="M12 2v3M10 3h4"/>',
taxi:'<path d="M5 10l2-4h10l2 4 2 2v5H3v-5l2-2Z"/><path d="M6 17v2M18 17v2M7 13h.01M17 13h.01M9 6l1-3h4l1 3"/>'
};return '<svg viewBox="0 0 24 24" aria-hidden="true">'+(p[id]||p.bus)+'</svg>'}
function transportEnabled(id){return transportPrefs[id]===true}
function saveTransportPrefs(){try{localStorage.setItem('rokin.transport.layers',JSON.stringify(transportPrefs))}catch{}}
function renderTransportPanel(){const root=$('transportGroups');if(!root)return;root.innerHTML='';const groups=[...new Set(TRANSPORT_TYPES.map(x=>x.group))];for(const group of groups){const sec=document.createElement('section');sec.className='transport-group';const h=document.createElement('div');h.className='transport-group-title';h.textContent=group;const grid=document.createElement('div');grid.className='transport-grid';for(const t of TRANSPORT_TYPES.filter(x=>x.group===group)){const b=document.createElement('button');b.className='transport-item'+(transportEnabled(t.id)?' active':'');b.style.setProperty('--transport-color',t.color);b.innerHTML='<span class="transport-icon">'+transportIcon(t.id)+'</span><span class="transport-item-text"><span class="transport-item-name"></span><span class="transport-item-source"></span></span><span class="transport-switch"></span>';b.querySelector('.transport-item-name').textContent=t.name;b.querySelector('.transport-item-source').textContent=t.source;b.onclick=()=>toggleTransport(t.id);grid.appendChild(b)}sec.append(h,grid);root.appendChild(sec)}updateTransportNote()}
function updateTransportNote(){
const n=TRANSPORT_TYPES.filter(t=>transportEnabled(t.id)).length;
const e=$('transportNote'),status=$('transportStatus'),badge=$('transportCountBadge'),btn=$('transportBtn');
const air=transportLiveCounts.airplane||0,heli=transportLiveCounts.helicopter||0,total=air+heli;
if(badge){badge.textContent=String(total);badge.classList.toggle('hidden',total<1)}
if(btn)btn.classList.toggle('has-live',total>0);
if(status){
 if(transportLastError&&!transportLastUpdate){status.textContent='LIVE ошибка · '+transportLastError;status.className='transport-sub transport-status-error'}
 else if(transportLastUpdate){status.textContent='LIVE · '+(lastAircraftProvider||'ADS-B')+' · '+total+' объектов';status.className='transport-sub transport-status-ok'}
 else{status.textContent='Получаю live-данные…';status.className='transport-sub'}
}
if(!e)return;e.classList.remove('actionable');e.onclick=null;
if(transportEnabled('airplane')||transportEnabled('helicopter')){
 const when=transportLastUpdate?(' · '+new Date(transportLastUpdate).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})):'';
 const provider=lastAircraftProvider?(' · '+lastAircraftProvider):'';
 const visible=countVisibleAircraft();
 if(total>0&&visible===0){e.textContent='Найдено '+total+' рядом'+provider+when+'. Нажмите здесь — покажу ближайший объект.';e.classList.add('actionable');e.onclick=focusNearestAircraft;return}
 if(transportLastError&&!transportLastUpdate){e.textContent='Источник не ответил: '+transportLastError;return}
 e.textContent='На экране '+visible+' · всего '+total+provider+when;return
}
e.textContent=n?('Включено слоёв: '+n+'. Для наземного транспорта нужен открытый региональный live-источник.'):'Включите нужные виды транспорта.'
}
function toggleTransport(id){transportPrefs[id]=!transportEnabled(id);saveTransportPrefs();renderTransportPanel();applyTransportVisibility(id);const t=TRANSPORT_TYPES.find(x=>x.id===id);if(id==='airplane'||id==='helicopter'){if(transportPrefs[id])requestLiveAircraft(true);else clearTransportType(id)}if(transportPrefs[id]&&id!=='airplane'&&id!=='helicopter')toast((t?.name||'Слой')+' включён. Нужен открытый live-источник для текущего региона.',3600)}
function openTransport(){renderTransportPanel();$('transportModal').classList.remove('hidden')}
function closeTransport(){$('transportModal').classList.add('hidden')}
function markerKey(v,i){return String(v.id??v.vehicleId??v.icao24??v.mmsi??v.label??i)}
function makeVehicleMarker(type,v){const t=TRANSPORT_TYPES.find(x=>x.id===type);const el=document.createElement('div');el.className='vehicle-marker';el.style.setProperty('--vehicle-color',t?.color||'#6d7dff');const route=v.route??v.routeShortName??v.line??'',label=(v.callsign||v.registration||v.label||'LIVE').trim();el.innerHTML='<div class="vehicle-bubble">'+transportIcon(type)+'</div><div class="vehicle-label"></div>'+(route?'<div class="vehicle-route"></div>':'');el.querySelector('.vehicle-label').textContent=label;if(route)el.querySelector('.vehicle-route').textContent=String(route).slice(0,5);el.onclick=e=>{e.stopPropagation();const bits=[t?.name,v.label||v.name||v.callsign||v.registration||'',route?('маршрут '+route):'',Number.isFinite(+v.speed)?('скорость '+Math.round(+v.speed)+' км/ч'):'',Number.isFinite(+v.altitude)?('высота '+Math.round(+v.altitude)+' м'):''].filter(Boolean);toast(bits.join(' · '),4600)};return el}
function setTransportVehicles(type,vehicles){if(!map||!TRANSPORT_TYPES.some(x=>x.id===type))return;let bucket=transportMarkers.get(type);if(!bucket){bucket=new Map();transportMarkers.set(type,bucket)}const seen=new Set();(vehicles||[]).forEach((v,i)=>{const lat=+(v.lat??v.latitude),lon=+(v.lon??v.lng??v.longitude);if(!Number.isFinite(lat)||!Number.isFinite(lon))return;const key=markerKey(v,i);seen.add(key);let item=bucket.get(key);if(!item){const marker=new maplibregl.Marker({element:makeVehicleMarker(type,v),anchor:'center'}).setLngLat([lon,lat]).addTo(map);item={marker,vehicle:v};bucket.set(key,item)}else{item.vehicle=v;item.marker.setLngLat([lon,lat])}item.marker.getElement().style.display=transportEnabled(type)?'block':'none'});for(const [key,item] of bucket){if(!seen.has(key)){item.marker.remove();bucket.delete(key)}}}
function clearTransportType(type){const b=transportMarkers.get(type);if(!b)return;for(const x of b.values())x.marker.remove();b.clear()}
function applyTransportVisibility(type){const b=transportMarkers.get(type);if(!b)return;for(const item of b.values())item.marker.getElement().style.display=transportEnabled(type)?'block':'none'}
function haversineNm(a,b){const R=3440.065,toRad=x=>x*Math.PI/180,dLat=toRad(b.lat-a.lat),dLon=toRad(b.lng-a.lng),la1=toRad(a.lat),la2=toRad(b.lat);const h=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(h))}
function currentAircraftRadius(){return 250}
function normalizeAircraft(a){const gs=Number(a.gs),altFeet=typeof a.alt_baro==='number'?a.alt_baro:(typeof a.alt_geom==='number'?a.alt_geom:NaN);return{id:a.hex||a.icao24,label:(a.flight||'').trim()||a.r||a.hex,callsign:(a.flight||'').trim(),registration:a.r||'',aircraftType:a.t||'',lat:Number(a.lat),lon:Number(a.lon),speed:Number.isFinite(gs)?gs*1.852:NaN,altitude:Number.isFinite(altFeet)?altFeet*0.3048:NaN,track:Number(a.track),category:a.category||'',source:lastAircraftProvider||'ADS-B'}}
function isRotorcraft(a){return String(a.category||'').toUpperCase()==='A7'||/HELI|ROTOR/i.test(String(a.desc||''))}
function consumeAircraftPayload(raw,provider=''){liveRequestInFlight=false;clearTimeout(liveRequestWatchdog);liveRequestWatchdog=null;let data;try{data=typeof raw==='string'?JSON.parse(raw):raw}catch{aircraftError('неверный ответ API');return}lastAircraftProvider=provider||lastAircraftProvider;transportLastError='';const list=Array.isArray(data?.ac)?data.ac:(Array.isArray(data?.aircraft)?data.aircraft:[]);const planes=[],helis=[];for(const a of list){if(!Number.isFinite(Number(a.lat))||!Number.isFinite(Number(a.lon)))continue;const v=normalizeAircraft(a);(isRotorcraft(a)?helis:planes).push(v)}lastAircraftVehicles=[...planes,...helis];transportLiveCounts.airplane=planes.length;transportLiveCounts.helicopter=helis.length;transportLastUpdate=Date.now();if(transportEnabled('airplane'))setTransportVehicles('airplane',planes);else clearTransportType('airplane');if(transportEnabled('helicopter'))setTransportVehicles('helicopter',helis);else clearTransportType('helicopter');updateTransportNote();const visible=countVisibleAircraft();if(lastAircraftVehicles.length>0&&visible===0&&!nearestHintShown){nearestHintShown=true;toast('Live-транспорт найден: '+lastAircraftVehicles.length+'. Откройте «Транспорт» и нажмите строку Live, чтобы показать ближайший.',5200)}}
function aircraftError(message){liveRequestInFlight=false;clearTimeout(liveRequestWatchdog);liveRequestWatchdog=null;transportLastError=message||'ошибка сети';updateTransportNote();if(!transportLastUpdate)toast('LIVE-транспорт: '+transportLastError,4200)}
function countVisibleAircraft(){if(!map||!lastAircraftVehicles.length)return 0;const b=map.getBounds();return lastAircraftVehicles.filter(v=>b.contains([+v.lon,+v.lat])).length}
function nearestAircraft(){if(!map||!lastAircraftVehicles.length)return null;const c=map.getCenter();return lastAircraftVehicles.reduce((best,v)=>{const d=haversineNm({lat:c.lat,lng:c.lng},{lat:+v.lat,lng:+v.lon});return !best||d<best.d?{v,d}:best},null)}
function focusNearestAircraft(){const n=nearestAircraft();if(!n){toast('Live-транспорт пока не найден');return}closeTransport();map.easeTo({center:[+n.v.lon,+n.v.lat],zoom:9,duration:900});toast('Показан ближайший объект · '+Math.round(n.d)+' мор. миль',3000)}
window.RokinTransportNative={onAircraft:consumeAircraftPayload,onAircraftError:aircraftError,onNearbyTransit:consumeNearbyTransitPayload,onTransitRoute:consumeTransitRoutePayload,onTransitError:transitRouteError};
function requestLiveAircraft(force=false){
 if(!map||document.hidden||(!transportEnabled('airplane')&&!transportEnabled('helicopter')))return;
 const now=Date.now();
 if(liveRequestInFlight&&now-liveRequestStartedAt<20000)return;
 if(liveRequestInFlight){liveRequestInFlight=false;clearTimeout(liveRequestWatchdog)}
 if(!force&&now-liveRequestLastAt<55000)return;
 const c=map.getCenter(),radius=currentAircraftRadius();
 liveRequestInFlight=true;liveRequestStartedAt=now;liveRequestLastAt=now;transportLastError='';updateTransportNote();
 clearTimeout(liveRequestWatchdog);liveRequestWatchdog=setTimeout(()=>aircraftError('таймаут live-данных'),18000);
 if(window.RokinNative&&typeof window.RokinNative.fetchAircraft==='function'){window.RokinNative.fetchAircraft(c.lat,c.lng,radius);return}
 fetch('https://api.adsb.lol/v2/point/'+c.lat.toFixed(5)+'/'+c.lng.toFixed(5)+'/'+radius).then(r=>r.json()).then(x=>consumeAircraftPayload(x,'ADSB.lol')).catch(()=>aircraftError('CORS/сеть'));
}
function startLiveTransport(){
 if(transportTimer)clearInterval(transportTimer);
 let started=false;
 const begin=()=>{if(started)return;started=true;requestLiveAircraft(true);transportTimer=setInterval(()=>requestLiveAircraft(false),60000)};
 if(navigator.geolocation){
  navigator.geolocation.getCurrentPosition(p=>{map.jumpTo({center:[p.coords.longitude,p.coords.latitude],zoom:8.5});resolveCityContext(p.coords.latitude,p.coords.longitude);begin()},()=>begin(),{enableHighAccuracy:false,timeout:5500,maximumAge:120000});
  setTimeout(begin,6000);
 }else begin();
 if(map){map.on('moveend',()=>{clearTimeout(transportMoveTimer);transportMoveTimer=setTimeout(()=>requestLiveAircraft(false),5000)})}
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)requestLiveAircraft(false)});
}
window.RokinTransport={types:TRANSPORT_TYPES,setVehicles:setTransportVehicles,clearType:clearTransportType,enabled:transportEnabled,refresh:requestLiveAircraft};


function setSearchContextUI(){
 const e=$('searchContext');if(!e)return;
 const ctx=state.cityContext;
 if(ctx&&ctx.city){e.textContent='Поиск в '+ctx.city+(ctx.region&&ctx.region!==ctx.city?' · '+ctx.region:'');e.classList.remove('hidden')}
 else e.classList.add('hidden');
}
async function resolveCityContext(lat,lon){
 try{
  const u='https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=10&accept-language=ru&lat='+encodeURIComponent(lat)+'&lon='+encodeURIComponent(lon);
  const r=await fetch(u,{headers:{Accept:'application/json'}});if(!r.ok)throw 0;
  const d=await r.json(),a=d.address||{};
  const city=a.city||a.town||a.village||a.municipality||a.county||'';
  const region=a.state||a.region||'';
  const country=a.country||'';
  const countryCode=(a.country_code||'').toLowerCase();
  const bbox=Array.isArray(d.boundingbox)&&d.boundingbox.length===4?d.boundingbox.map(Number):null;
  state.cityContext={city,region,country,countryCode,bbox,lat:+lat,lon:+lon};
  setSearchContextUI();
  return state.cityContext;
 }catch(e){return null}
}
function distanceM(a,b){const R=6371000,toRad=x=>x*Math.PI/180,dLat=toRad(+b.lat-+a.lat),dLon=toRad(+b.lon-+a.lon),la1=toRad(+a.lat),la2=toRad(+b.lat);const h=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(h))}
function transitTypeLabel(type){return({bus:'Автобус',trolleybus:'Троллейбус',tram:'Трамвай',share_taxi:'Маршрутка'})[type]||'Маршрут'}
function transitTypeIcon(type){return({bus:'bus',trolleybus:'trolleybus',tram:'tram',share_taxi:'minibus'})[type]||'bus'}
function closeNearbyTransit(){$('nearbyTransit')?.classList.add('hidden')}
function clearTransitOverlay(){
 const src=map?.getSource('transit-route');if(src)src.setData({type:'FeatureCollection',features:[]});
 for(const m of state.transitStopMarkers){try{m.remove()}catch{}}state.transitStopMarkers=[];state.activeTransitRelation=null;
 document.querySelectorAll('.nearby-route.active').forEach(x=>x.classList.remove('active'));
}
function renderNearbyTransit(){
 const panel=$('nearbyTransit'),sub=$('nearbyTransitSub'),root=$('nearbyTransitRoutes');if(!panel||!sub||!root)return;
 panel.classList.remove('hidden');root.innerHTML='';
 const data=state.nearbyTransit;
 if(!data){sub.textContent='Ищу ближайшую остановку…';return}
 if(!data.stops.length){sub.textContent='Остановки рядом не найдены';root.innerHTML='<div class="nearby-empty">Попробуйте выбрать другой адрес или увеличить масштаб поиска.</div>';return}
 const stop=data.stops[0];sub.textContent='Ближайшая: '+(stop.name||'остановка')+' · '+Math.round(stop.distance)+' м';
 if(!data.routes.length){root.innerHTML='<div class="nearby-empty">Для этой остановки в OpenStreetMap не указаны маршруты.</div>';return}
 for(const route of data.routes.slice(0,14)){
  const b=document.createElement('button');b.className='nearby-route';b.dataset.relation=String(route.id);
  b.innerHTML='<span class="nearby-route-icon"></span><span class="nearby-route-text"><span class="nearby-route-num"></span><span class="nearby-route-type"></span></span>';
  b.querySelector('.nearby-route-icon').innerHTML=transportIcon(transitTypeIcon(route.type));
  b.querySelector('.nearby-route-num').textContent=route.ref||route.name||'—';
  b.querySelector('.nearby-route-type').textContent=transitTypeLabel(route.type);
  b.onclick=()=>showTransitRelation(route,b);
  root.appendChild(b);
 }
}
function consumeNearbyTransitPayload(raw){
 let data;try{data=typeof raw==='string'?JSON.parse(raw):raw}catch{return transitNearbyError('неверный ответ')}
 const elements=Array.isArray(data?.elements)?data.elements:[];
 const target=state.destination;if(!target)return;
 const nodes=elements.filter(e=>e.type==='node'&&Number.isFinite(+e.lat)&&Number.isFinite(+e.lon)).map(n=>({id:n.id,lat:+n.lat,lon:+n.lon,name:n.tags?.name||n.tags?.['name:ru']||'Остановка',tags:n.tags||{},distance:distanceM(target,{lat:+n.lat,lon:+n.lon})})).sort((a,b)=>a.distance-b.distance);
 const relevant=nodes.slice(0,8),relevantIds=new Set(relevant.map(x=>x.id));
 const byKey=new Map();
 for(const rel of elements.filter(e=>e.type==='relation'&&e.tags?.type==='route')){
  const type=rel.tags?.route||'';if(!['bus','trolleybus','tram','share_taxi'].includes(type))continue;
  const members=Array.isArray(rel.members)?rel.members:[];
  const memberIds=new Set(members.filter(m=>m.type==='node').map(m=>m.ref));
  const matched=relevant.filter(s=>memberIds.has(s.id));
  if(!matched.length)continue;
  const ref=rel.tags?.ref||rel.tags?.name||String(rel.id),key=type+'|'+ref;
  const item={id:rel.id,type,ref,name:rel.tags?.name||'',from:rel.tags?.from||'',to:rel.tags?.to||'',distance:Math.min(...matched.map(s=>s.distance))};
  if(!byKey.has(key)||item.distance<byKey.get(key).distance)byKey.set(key,item);
 }
 const routes=[...byKey.values()].sort((a,b)=>a.distance-b.distance||String(a.ref).localeCompare(String(b.ref),'ru',{numeric:true}));
 state.nearbyTransit={stops:relevant,routes};renderNearbyTransit();
}
function transitNearbyError(message){
 const panel=$('nearbyTransit'),sub=$('nearbyTransitSub'),root=$('nearbyTransitRoutes');panel?.classList.remove('hidden');if(sub)sub.textContent='Не удалось получить остановки';if(root)root.innerHTML='<div class="nearby-empty">'+String(message||'Ошибка сети')+'</div>';
}
function loadNearbyTransitForPlace(p){
 if(!p)return;state.nearbyTransit=null;renderNearbyTransit();clearTransitOverlay();
 if(window.RokinNative&&typeof window.RokinNative.fetchNearbyTransit==='function'){window.RokinNative.fetchNearbyTransit(+p.lat,+p.lon,1100);return}
 const q='[out:json][timeout:20];(node(around:1100,'+p.lat+','+p.lon+')["highway"="bus_stop"];node(around:1100,'+p.lat+','+p.lon+')["public_transport"="platform"];)->.stops;rel(bn.stops)["type"="route"]["route"~"^(bus|trolleybus|tram|share_taxi)$"]->.routes;(.stops;.routes;);out body;';
 fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'data='+encodeURIComponent(q)}).then(r=>r.json()).then(consumeNearbyTransitPayload).catch(()=>transitNearbyError('Overpass недоступен'));
}
function showTransitRelation(route,button){
 document.querySelectorAll('.nearby-route.active').forEach(x=>x.classList.remove('active'));button?.classList.add('active');state.activeTransitRelation=route;
 if(window.RokinNative&&typeof window.RokinNative.fetchTransitRoute==='function'){window.RokinNative.fetchTransitRoute(Number(route.id));return}
 const q='[out:json][timeout:25];relation('+route.id+');out geom;';
 fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'data='+encodeURIComponent(q)}).then(r=>r.json()).then(x=>consumeTransitRoutePayload(JSON.stringify(x),String(route.id))).catch(()=>toast('Не удалось загрузить схему маршрута'));
}
function consumeTransitRoutePayload(raw,relationId=''){
 let data;try{data=typeof raw==='string'?JSON.parse(raw):raw}catch{return}
 const rel=(data?.elements||[]).find(e=>e.type==='relation');if(!rel)return toast('Схема маршрута не найдена');
 const features=[],all=[];
 for(const m of rel.members||[]){
  if(m.type==='way'&&Array.isArray(m.geometry)&&m.geometry.length>1){const coords=m.geometry.map(p=>[+p.lon,+p.lat]).filter(x=>x.every(Number.isFinite));if(coords.length>1){features.push({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}});all.push(...coords)}}
 }
 const src=map?.getSource('transit-route');if(src)src.setData({type:'FeatureCollection',features});
 for(const m of state.transitStopMarkers){try{m.remove()}catch{}}state.transitStopMarkers=[];
 const stopMembers=(rel.members||[]).filter(m=>m.type==='node'&&Number.isFinite(+m.lat)&&Number.isFinite(+m.lon)&&/(stop|platform)/i.test(String(m.role||''))).slice(0,60);
 for(const s of stopMembers){const el=document.createElement('div');el.className='transit-stop-marker';const mk=new maplibregl.Marker({element:el,anchor:'center'}).setLngLat([+s.lon,+s.lat]).addTo(map);state.transitStopMarkers.push(mk)}
 if(all.length){const b=all.reduce((bb,x)=>bb.extend(x),new maplibregl.LngLatBounds(all[0],all[0]));map.fitBounds(b,{padding:innerWidth<720?{top:330,bottom:80,left:35,right:35}:80,maxZoom:15,duration:800})}
 const ref=rel.tags?.ref||state.activeTransitRelation?.ref||'';toast('Маршрут '+ref+' показан на карте',2600);
}
function transitRouteError(message){toast(message||'Не удалось загрузить маршрут',3500)}

function toast(msg,ms=3000){const e=$('toast');e.textContent=msg;e.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.add('hidden'),ms)}
function setHint(t){$('hintText').textContent=t}function safeName(p){return p?.display_name||p?.name||'Точка на карте'}
function initMap(){if(!window.maplibregl){toast('Не удалось загрузить движок карты');return}map=new maplibregl.Map({container:'map',style:'https://tiles.openfreemap.org/styles/liberty',center:[73.3686,54.9893],zoom:11,attributionControl:false,maxPitch:70});map.on('load',()=>{map.addSource('route',{type:'geojson',data:{type:'FeatureCollection',features:[]}});map.addLayer({id:'route-shadow',type:'line',source:'route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#0b1020','line-width':10,'line-opacity':.42}});map.addLayer({id:'route-line',type:'line',source:'route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#6d7dff','line-width':6}});map.addSource('transit-route',{type:'geojson',data:{type:'FeatureCollection',features:[]}});map.addLayer({id:'transit-route-shadow',type:'line',source:'transit-route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#101522','line-width':9,'line-opacity':.48}});map.addLayer({id:'transit-route-line',type:'line',source:'transit-route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#ffb84d','line-width':5,'line-opacity':.95}});startLiveTransport()});map.on('click',e=>{if(!$('searchModal').classList.contains('hidden'))return;const p={lat:e.lngLat.lat,lon:e.lngLat.lng,display_name:e.lngLat.lat.toFixed(5)+', '+e.lngLat.lng.toFixed(5)};if(!state.origin)setPlace('origin',p);else if(!state.destination)setPlace('destination',p)})}
function markerElement(kind){const e=document.createElement('div');e.className='marker-pin '+kind;return e}function setMarker(kind,p){if(state.markers[kind])state.markers[kind].remove();state.markers[kind]=new maplibregl.Marker({element:markerElement(kind),anchor:'bottom'}).setLngLat([+p.lon,+p.lat]).addTo(map)}
function setPlace(kind,p){state[kind]=p;setMarker(kind,p);const t=$(kind+'Text');t.textContent=safeName(p);t.classList.remove('muted');if(kind==='destination'){map.easeTo({center:[+p.lon,+p.lat],zoom:14,duration:650});loadNearbyTransitForPlace(p)}if(state.origin&&state.destination)buildRoute();else setHint('Теперь выберите '+(state.origin?'пункт назначения':'точку отправления'))}
async function search(q){
 q=q.trim();if(q.length<2){$('searchState').textContent='Введите хотя бы 2 символа';return}
 if(state.searchAbort)state.searchAbort.abort();state.searchAbort=new AbortController();$('results').innerHTML='';setSearchContextUI();
 const ctx=state.cityContext,params=new URLSearchParams({format:'jsonv2',limit:'8',addressdetails:'1','accept-language':'ru'});
 let query=q;
 if(ctx?.city){query+=', '+ctx.city;if(ctx.region&&ctx.region!==ctx.city)query+=', '+ctx.region;$('searchState').textContent='Ищу в '+ctx.city+'…'}else $('searchState').textContent='Ищу…';
 params.set('q',query);
 if(ctx?.countryCode)params.set('countrycodes',ctx.countryCode);
 if(Array.isArray(ctx?.bbox)&&ctx.bbox.length===4){const [south,north,west,east]=ctx.bbox;params.set('viewbox',[west,north,east,south].join(','));params.set('bounded','1')}
 try{const r=await fetch('https://nominatim.openstreetmap.org/search?'+params.toString(),{headers:{Accept:'application/json'},signal:state.searchAbort.signal});if(!r.ok)throw new Error('HTTP '+r.status);const a=await r.json();$('searchState').textContent=a.length?('Найдено в '+(ctx?.city||'результатах')+': '+a.length):(ctx?.city?('В '+ctx.city+' ничего не найдено'):'Ничего не найдено');a.forEach(p=>{const b=document.createElement('button');b.className='result';const title=p.name||p.display_name.split(',')[0];b.innerHTML='<span class="result-icon">⌖</span><span><div class="result-title"></div><div class="result-sub"></div></span>';b.querySelector('.result-title').textContent=title;b.querySelector('.result-sub').textContent=p.display_name;b.onclick=()=>{setPlace(state.selectTarget,p);closeSearch()};$('results').appendChild(b)})}catch(e){if(e.name!=='AbortError')$('searchState').textContent='Ошибка поиска. Проверьте интернет.'}
}
function openSearch(target){state.selectTarget=target;$('searchInput').value='';$('results').innerHTML='';setSearchContextUI();$('searchState').textContent=state.cityContext?.city?('Ищем только в '+state.cityContext.city):(target==='origin'?'Найдите точку отправления':'Найдите пункт назначения');$('searchModal').classList.remove('hidden');setTimeout(()=>$('searchInput').focus(),100)}function closeSearch(){$('searchModal').classList.add('hidden')}
function routeBase(){if(state.mode==='foot')return'https://routing.openstreetmap.de/routed-foot/route/v1/driving';if(state.mode==='bike')return'https://routing.openstreetmap.de/routed-bike/route/v1/driving';return'https://router.project-osrm.org/route/v1/driving'}
async function buildRoute(){if(!state.origin||!state.destination||!map)return;setHint('Строю маршрут…');$('routeSummary').classList.add('hidden');const a=state.origin,b=state.destination,u=routeBase()+'/'+a.lon+','+a.lat+';'+b.lon+','+b.lat+'?overview=full&geometries=geojson&steps=true&alternatives=false';try{const r=await fetch(u);if(!r.ok)throw 0;const d=await r.json();if(d.code!=='Ok'||!d.routes?.length)throw 0;const route=d.routes[0];state.route=route;map.getSource('route')?.setData({type:'Feature',properties:{},geometry:route.geometry});const c=route.geometry.coordinates,bb=c.reduce((z,x)=>z.extend(x),new maplibregl.LngLatBounds(c[0],c[0]));map.fitBounds(bb,{padding:innerWidth<720?{top:320,bottom:95,left:40,right:40}:90,duration:750,maxZoom:16});$('durationText').textContent=formatDuration(route.duration);$('distanceText').textContent=formatDistance(route.distance);$('routeSummary').classList.remove('hidden');setHint('Маршрут готов')}catch(e){clearRouteLine();setHint('Маршрут не построен');toast('Не удалось построить маршрут')}}
function formatDuration(s){const m=Math.max(1,Math.round(s/60));if(m<60)return m+' мин';const h=Math.floor(m/60),r=m%60;return r?h+' ч '+r+' мин':h+' ч'}function formatDistance(m){return m<1000?Math.round(m)+' м':(m/1000).toFixed(m<10000?1:0)+' км'}function clearRouteLine(){map?.getSource('route')?.setData({type:'FeatureCollection',features:[]});$('routeSummary').classList.add('hidden')}
function locate(){if(!navigator.geolocation){toast('Геолокация недоступна');return}setHint('Определяю местоположение…');navigator.geolocation.getCurrentPosition(async pos=>{const p={lat:pos.coords.latitude,lon:pos.coords.longitude,display_name:'Моё местоположение'};setPlace('origin',p);map.easeTo({center:[p.lon,p.lat],zoom:15,duration:700});const ctx=await resolveCityContext(p.lat,p.lon);setHint(state.destination?'Строю маршрут…':(ctx?.city?'Местоположение: '+ctx.city:'Местоположение определено'));if(ctx?.city)toast('Поиск теперь ограничен городом '+ctx.city,3000)},err=>{setHint('Не удалось определить местоположение');if(err.code===1)toast('Разрешите Rokin Maps доступ к местоположению',4500);else toast('Включите геолокацию на телефоне и попробуйте ещё раз',4000)},{enableHighAccuracy:true,timeout:15000,maximumAge:10000})}
function reset(){['origin','destination'].forEach(k=>{state[k]=null;if(state.markers[k]){state.markers[k].remove();state.markers[k]=null}const e=$(k+'Text');e.textContent=k==='origin'?'Выберите точку':'Куда едем?';e.classList.add('muted')});state.route=null;state.nearbyTransit=null;clearRouteLine();clearTransitOverlay();closeNearbyTransit();setHint('Укажите начало и конец маршрута')}function swap(){const a=state.origin,b=state.destination;if(!a&&!b)return;if(state.markers.origin){state.markers.origin.remove();state.markers.origin=null}if(state.markers.destination){state.markers.destination.remove();state.markers.destination=null}state.origin=b;state.destination=a;['origin','destination'].forEach(k=>{const p=state[k],e=$(k+'Text');if(p){e.textContent=safeName(p);e.classList.remove('muted');setMarker(k,p)}else{e.textContent=k==='origin'?'Выберите точку':'Куда едем?';e.classList.add('muted')}});if(state.origin&&state.destination)buildRoute();else clearRouteLine()}
$('originBtn').onclick=()=>openSearch('origin');$('destinationBtn').onclick=()=>openSearch('destination');$('closeNearbyTransit').onclick=()=>{closeNearbyTransit();clearTransitOverlay()};$('closeSearch').onclick=closeSearch;$('searchModal').onclick=e=>{if(e.target===$('searchModal'))closeSearch()};$('searchSubmit').onclick=()=>search($('searchInput').value);$('searchInput').onkeydown=e=>{if(e.key==='Enter')search(e.currentTarget.value)};$('locateBtn').onclick=locate;$('centerBtn').onclick=locate;$('swapBtn').onclick=swap;$('clearBtn').onclick=reset;$('zoomInBtn').onclick=()=>map?.zoomIn();$('zoomOutBtn').onclick=()=>map?.zoomOut();$('collapseBtn').onclick=()=>{const c=$('routeCard');c.classList.toggle('compact');$('collapseBtn').textContent=c.classList.contains('compact')?'⌃':'⌄'};document.querySelectorAll('.mode').forEach(b=>b.onclick=()=>{document.querySelectorAll('.mode').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.mode=b.dataset.mode;if(state.origin&&state.destination)buildRoute()});$('transportBtn').onclick=openTransport;$('closeTransport').onclick=closeTransport;$('transportModal').onclick=e=>{if(e.target===$('transportModal'))closeTransport()};$('startBtn').onclick=()=>toast('Навигационный режим добавим следующим этапом');renderTransportPanel();initMap()})();