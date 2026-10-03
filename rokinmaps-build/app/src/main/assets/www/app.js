(()=>{'use strict';const $=id=>document.getElementById(id);const state={origin:null,destination:null,mode:'car',route:null,selectTarget:'destination',markers:{origin:null,destination:null},searchAbort:null,cityContext:null,nearbyTransit:null,activeTransitRelation:null,transitStopMarkers:[],nearbyStopMarkers:[],nearbyTransitToken:0,nearbyTransitExpected:0,nearbyTransitRadiusIndex:0,nearbyTransitRouteIndex:0,nearbyTransitTimer:null,transitPlanner:null};let map;
const nav={active:false,completed:false,watchId:null,follow:true,sound:true,marker:null,lastPos:null,lastBearing:0,routeCoords:[],routeCum:[],totalDistance:0,maneuvers:[],spoken:new Set(),lastRerouteAt:0,rerouting:false,lastProgress:0,lastStepIndex:-1,arrivedSpoken:false};
const SEARCH_HISTORY_KEY='rokin.search.history.v1';
let searchSuggestTimer=null;
let searchSuggestSeq=0;
let searchSuggestActive=0;
const searchSuggestionCache=new Map();


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
window.RokinTransportNative={onAircraft:consumeAircraftPayload,onAircraftError:aircraftError,onNearbyStops:consumeNearbyStopsPayload,onNearbyStopsError:nearbyStopsError,onDirectRoutes:consumeDirectRoutesPayload,onDirectRoutesError:directRoutesError,onRouteSchedule:consumeRouteSchedulePayload,onTransitRoute:consumeTransitRoutePayload,onTransitError:transitRouteError};
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
function normalizeTransitType(tags={}){
 const raw=String(tags.route||'').toLowerCase();
 const text=[tags.name,tags.ref,tags.operator,tags.network,tags.description,tags.bus,tags.service].filter(Boolean).join(' ').toLowerCase();
 if(raw==='share_taxi'||tags.share_taxi==='yes'||/маршрут(ка|ное такси)|minibus|shuttle/.test(text))return'share_taxi';
 if(raw==='trolleybus')return'trolleybus';
 if(raw==='tram')return'tram';
 return'bus'
}
function transitTypeLabel(type){return({bus:'Автобус',trolleybus:'Троллейбус',tram:'Трамвай',share_taxi:'Маршрутка'})[type]||'Маршрут'}
function transitTypeIcon(type){return({bus:'bus',trolleybus:'trolleybus',tram:'tram',share_taxi:'minibus'})[type]||'bus'}
function transitTypeClass(type){return({bus:'bus',trolleybus:'trolleybus',tram:'tram',share_taxi:'minibus'})[type]||'bus'}
function closeNearbyTransit(){$('nearbyTransit')?.classList.add('hidden')}
function clearTransitOverlay(){
 const src=map?.getSource('transit-route');if(src)src.setData({type:'FeatureCollection',features:[]});
 for(const m of state.transitStopMarkers){try{m.remove()}catch{}}state.transitStopMarkers=[];state.activeTransitRelation=null;
 document.querySelectorAll('.nearby-route.active').forEach(x=>x.classList.remove('active'));
}
function parseRouteHours(tags={}){
 const candidates=[tags.opening_hours,tags.service_times,tags['service_times:weekdays'],tags['opening_hours:service']].filter(Boolean);
 for(const raw of candidates){
  const text=String(raw);
  const m=text.match(/(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/);
  if(m)return{from:m[1],to:m[2],source:'OpenStreetMap',raw:text,status:'ok'}
 }
 return{from:'',to:'',source:'',raw:'',status:'loading'}
}
function scheduleText(route){
 const s=route.schedule||{};
 if(s.status==='ok'&&s.from&&s.to)return s.from+'–'+s.to+(route.interval?(' · ~'+route.interval+' мин'):'');
 if(s.status==='loading')return'расписание…';
 if(s.status==='unavailable'||s.status==='not_found')return route.interval?('интервал ~'+route.interval+' мин'):'время не найдено';
 if(s.status==='error')return'расписание недоступно';
 return'расписание…'
}
function renderNearbyTransit(){
 const panel=$('nearbyTransit'),sub=$('nearbyTransitSub'),root=$('nearbyTransitRoutes');if(!panel||!sub||!root)return;
 panel.classList.remove('hidden');root.innerHTML='';
 const planner=state.transitPlanner;
 if(!planner){sub.textContent='Ищу транспорт, который довезёт к адресу…';return}
 if(planner.error){sub.textContent=planner.error;root.innerHTML='<div class="nearby-empty">Попробуйте выбрать адрес ещё раз или уточнить точку «Откуда».</div>';return}
 if(planner.loadingStops){sub.textContent='Ищу остановки: до 1,5 км от вас и до 900 м от адреса…';root.innerHTML='<div class="nearby-empty">Сопоставляю остановки отправления и назначения…</div>';return}
 if(planner.loadingRoutes){sub.textContent='Ищу прямые маршруты между найденными остановками…';root.innerHTML='<div class="nearby-empty">Оставлю только транспорт, на который можно сесть рядом и доехать к нужному месту без пересадки.</div>';return}
 const routes=planner.routes||[];
 if(!routes.length){sub.textContent='Прямых маршрутов не найдено';root.innerHTML='<div class="nearby-empty">В пределах 1,5 км от точки отправления и 900 м от адреса назначения прямого транспорта в открытых данных не найдено.</div>';return}
 sub.textContent='Прямые маршруты: '+routes.length+' · посадка до 1,5 км';
 for(const route of routes){
  const b=document.createElement('button');b.className='nearby-route transport-'+transitTypeClass(route.type);b.dataset.relation=String(route.id);
  const schedule=route.schedule||{};
  b.innerHTML='<span class="nearby-route-icon"></span><span class="nearby-route-text"><span class="nearby-route-num"></span><span class="nearby-route-type"></span><span class="nearby-route-hours"></span><span class="nearby-route-source"></span></span>';
  b.querySelector('.nearby-route-icon').innerHTML=transportIcon(transitTypeIcon(route.type));
  b.querySelector('.nearby-route-num').textContent=route.ref||route.name||'—';
  const board=route.boardingStop,alight=route.alightingStop;
  b.querySelector('.nearby-route-type').textContent=transitTypeLabel(route.type)+(board?' · '+Math.round(board.distance)+' м до посадки':'');
  const h=b.querySelector('.nearby-route-hours');h.textContent=scheduleText(route);h.classList.toggle('loading',schedule.status==='loading');h.classList.toggle('unavailable',['unavailable','not_found','error'].includes(schedule.status));
  b.querySelector('.nearby-route-source').textContent=alight?('выход: '+(alight.name||'остановка')+' · '+Math.round(alight.distance)+' м до адреса'):(schedule.source?('график: '+schedule.source):'');
  b.onclick=()=>selectNearbyTransport(route,b);
  root.appendChild(b)
 }
}
function clearNearbyStopMarkers(){
 for(const m of state.nearbyStopMarkers){try{m.remove()}catch{}}
 state.nearbyStopMarkers=[]
}
function highlightTransitStops(board,alight){
 clearNearbyStopMarkers();if(!map)return;
 if(board){
  const el=document.createElement('div');el.className='boarding-stop-marker';el.innerHTML=transportIcon('bus');
  state.nearbyStopMarkers.push(new maplibregl.Marker({element:el,anchor:'center'}).setLngLat([+board.lon,+board.lat]).addTo(map))
 }
 if(alight){
  const el=document.createElement('div');el.className='alighting-stop-marker';el.textContent='✓';
  state.nearbyStopMarkers.push(new maplibregl.Marker({element:el,anchor:'center'}).setLngLat([+alight.lon,+alight.lat]).addTo(map))
 }
}
function selectNearbyTransport(route,button){
 document.querySelectorAll('.nearby-route.active').forEach(x=>x.classList.remove('active'));button?.classList.add('active');
 const board=route.boardingStop,alight=route.alightingStop;
 if(board&&alight){
  highlightTransitStops(board,alight);
  const ref=route.ref||route.name||'',msg=(ref?('Маршрут '+ref+': '):'')+'сесть «'+(board.name||'Остановка')+'» · '+Math.round(board.distance)+' м → выйти «'+(alight.name||'Остановка')+'» · '+Math.round(alight.distance)+' м до адреса';
  const sub=$('nearbyTransitSub');if(sub)sub.textContent=msg;toast(msg,6500)
 }
 showTransitRelation(route,button)
}
function nearbyWatchdog(token,stage){
 clearTimeout(state.nearbyTransitTimer);
 state.nearbyTransitTimer=setTimeout(()=>{
  const p=state.transitPlanner;if(!p||token!==p.token)return;
  if(stage==='stops')transitPlannerError(token,'Не удалось получить остановки вовремя');
  if(stage==='routes')transitPlannerError(token,'Не удалось сопоставить маршруты вовремя')
 },17000)
}
function transitElementPoint(e){
 const lat=Number.isFinite(+e.lat)?+e.lat:+e.center?.lat,lon=Number.isFinite(+e.lon)?+e.lon:+e.center?.lon;
 return Number.isFinite(lat)&&Number.isFinite(lon)?{lat,lon}:null
}
function parseStopsAround(raw,point,radius){
 let data;try{data=typeof raw==='string'?JSON.parse(raw):raw}catch{return[]}
 const seen=new Set(),stops=[];
 for(const e of Array.isArray(data?.elements)?data.elements:[]){
  const p=transitElementPoint(e);if(!p)continue;
  const key=e.type+':'+e.id;if(seen.has(key))continue;seen.add(key);
  const distance=distanceM(point,p);if(distance>radius+20)continue;
  const tags=e.tags||{},name=tags.name||tags['name:ru']||tags.ref||'Остановка';
  stops.push({id:e.id,osmType:e.type,lat:p.lat,lon:p.lon,name,tags,distance})
 }
 stops.sort((a,b)=>a.distance-b.distance);
 return stops
}
function transitStopKey(s){return String(s.osmType||'node')+':'+String(s.id)}
async function resolveTransitOrigin(){
 if(state.origin&&Number.isFinite(+state.origin.lat)&&Number.isFinite(+state.origin.lon))return{lat:+state.origin.lat,lon:+state.origin.lon,display_name:state.origin.display_name||'Точка отправления'};
 if(!navigator.geolocation)return null;
 return await new Promise(resolve=>navigator.geolocation.getCurrentPosition(p=>resolve({lat:p.coords.latitude,lon:p.coords.longitude,display_name:'Моё местоположение'}),()=>resolve(null),{enableHighAccuracy:true,timeout:9000,maximumAge:15000}))
}
function requestPlannerStops(planner,side){
 const isOrigin=side==='origin',point=isOrigin?planner.origin:planner.destination,radius=isOrigin?1500:900,requestId=planner.token*10+(isOrigin?1:2);
 nearbyWatchdog(planner.token,'stops');
 if(window.RokinNative&&typeof window.RokinNative.fetchNearbyStops==='function'){window.RokinNative.fetchNearbyStops(+point.lat,+point.lon,radius,requestId);return}
 const q='[out:json][timeout:10];(node(around:'+radius+','+point.lat+','+point.lon+')["highway"="bus_stop"];nwr(around:'+radius+','+point.lat+','+point.lon+')["public_transport"="platform"];);out tags center 200;';
 fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'data='+encodeURIComponent(q)}).then(r=>r.json()).then(x=>consumeNearbyStopsPayload(JSON.stringify(x),String(requestId))).catch(()=>nearbyStopsError('ошибка сети',String(requestId)))
}
function consumeNearbyStopsPayload(raw,requestId=''){
 const id=Number(requestId),token=Math.floor(id/10),side=id%10===1?'origin':'destination',planner=state.transitPlanner;
 if(!planner||token!==planner.token)return;
 const point=side==='origin'?planner.origin:planner.destination,radius=side==='origin'?1500:900,stops=parseStopsAround(raw,point,radius);
 if(side==='origin')planner.originStops=stops;else planner.destinationStops=stops;
 if(planner.originStops&&planner.destinationStops){
  clearTimeout(state.nearbyTransitTimer);planner.loadingStops=false;
  if(!planner.originStops.length)return transitPlannerError(token,'Рядом с точкой отправления нет остановок в пределах 1,5 км');
  if(!planner.destinationStops.length)return transitPlannerError(token,'У адреса назначения нет остановок в пределах 900 м');
  requestDirectRoutes(planner)
 }else renderNearbyTransit()
}
function nearbyStopsError(message,requestId=''){
 const id=Number(requestId),token=Math.floor(id/10);transitPlannerError(token,'Не удалось получить остановки: '+(message||'ошибка сети'))
}
function requestDirectRoutes(planner){
 if(!planner||planner.token!==state.transitPlanner?.token)return;
 planner.loadingRoutes=true;renderNearbyTransit();nearbyWatchdog(planner.token,'routes');
 const retry=Number(planner.directRetry||0),originLimit=retry?16:32,destLimit=retry?12:24;
 const originPayload=JSON.stringify(planner.originStops.slice(0,originLimit).map(s=>({type:s.osmType||'node',id:Number(s.id||0)})));
 const destPayload=JSON.stringify(planner.destinationStops.slice(0,destLimit).map(s=>({type:s.osmType||'node',id:Number(s.id||0)})));
 if(window.RokinNative&&typeof window.RokinNative.fetchDirectRoutes==='function'){window.RokinNative.fetchDirectRoutes(originPayload,destPayload,planner.token);return}
 transitPlannerError(planner.token,'Поиск прямых маршрутов недоступен в этой сборке')
}
function memberIndexMap(rel){
 const m=new Map();(Array.isArray(rel.members)?rel.members:[]).forEach((x,i)=>m.set(String(x.type)+':'+String(x.ref),i));return m
}
function chooseDirectStopPair(rel,originStops,destinationStops){
 const indices=memberIndexMap(rel),os=originStops.filter(s=>indices.has(transitStopKey(s))),ds=destinationStops.filter(s=>indices.has(transitStopKey(s)));
 let best=null;
 for(const o of os)for(const d of ds){
  const oi=indices.get(transitStopKey(o)),di=indices.get(transitStopKey(d));
  if(oi>=di)continue;
  const score=o.distance+d.distance;
  if(!best||score<best.score)best={boardingStop:o,alightingStop:d,score,originIndex:oi,destinationIndex:di}
 }
 return best
}
function consumeDirectRoutesPayload(raw,requestId=''){
 const token=Number(requestId),planner=state.transitPlanner;if(!planner||token!==planner.token)return;clearTimeout(state.nearbyTransitTimer);
 let data;try{data=typeof raw==='string'?JSON.parse(raw):raw}catch{return transitPlannerError(token,'Неверный ответ сервиса маршрутов')}
 const byKey=new Map();
 for(const rel of Array.isArray(data?.elements)?data.elements:[]){
  if(rel.type!=='relation'||rel.tags?.type!=='route')continue;
  const tags=rel.tags||{},rawType=tags.route||'';if(!['bus','trolleybus','tram','share_taxi'].includes(rawType))continue;
  const pair=chooseDirectStopPair(rel,planner.originStops,planner.destinationStops);if(!pair)continue;
  const type=normalizeTransitType(tags),ref=tags.ref||tags.name||String(rel.id),key=type+'|'+ref,schedule=parseRouteHours(tags),interval=String(tags.interval||tags['interval:conditional']||'').match(/\d+/)?.[0]||'';
  const item={id:rel.id,type,ref,name:tags.name||'',from:tags.from||'',to:tags.to||'',tags,interval,schedule,boardingStop:pair.boardingStop,alightingStop:pair.alightingStop,score:pair.score};
  const prev=byKey.get(key);if(!prev||item.score<prev.score)byKey.set(key,item)
 }
 planner.routes=[...byKey.values()].sort((a,b)=>a.boardingStop.distance-b.boardingStop.distance||a.alightingStop.distance-b.alightingStop.distance||String(a.ref).localeCompare(String(b.ref),'ru',{numeric:true}));
 planner.loadingRoutes=false;renderNearbyTransit();requestRouteSchedules(token,planner.routes)
}
function directRoutesError(message,requestId=''){
 const token=Number(requestId),planner=state.transitPlanner;if(!planner||token!==planner.token)return;
 if(!planner.directRetry){planner.directRetry=1;planner.error=null;planner.loadingRoutes=true;const sub=$('nearbyTransitSub');if(sub)sub.textContent='Сервис ответил медленно — повторяю поиск…';requestDirectRoutes(planner);return}
 const text=String(message||'сервер маршрутов временно недоступен');transitPlannerError(token,'Не удалось найти прямой транспорт: '+text)
}
function transitPlannerError(token,message){
 const p=state.transitPlanner;if(!p||token!==p.token)return;clearTimeout(state.nearbyTransitTimer);p.loadingStops=false;p.loadingRoutes=false;p.error=message;p.routes=[];renderNearbyTransit()
}
function requestRouteSchedules(token,routes){
 const city=state.cityContext?.city||'';
 routes.forEach((route,i)=>{
  if(route.schedule?.status==='ok')return;
  if(window.RokinNative&&typeof window.RokinNative.fetchRouteSchedule==='function'){
   setTimeout(()=>{if(token===state.transitPlanner?.token)window.RokinNative.fetchRouteSchedule(city,route.type,String(route.ref||''),token)},i*300)
  }else route.schedule={status:'unavailable',from:'',to:'',source:''}
 });
 renderNearbyTransit()
}
function consumeRouteSchedulePayload(raw,requestId=''){
 const token=Number(requestId),planner=state.transitPlanner;if(!planner||token!==planner.token)return;
 let d;try{d=typeof raw==='string'?JSON.parse(raw):raw}catch{return}
 for(const route of planner.routes||[])if(String(route.ref)===String(d.ref)&&String(route.type)===String(d.type))route.schedule={status:d.status||'not_found',from:d.from||'',to:d.to||'',source:d.source||''};
 renderNearbyTransit()
}
async function loadNearbyTransitForPlace(p){
 if(!p)return;const token=++state.nearbyTransitToken,origin=await resolveTransitOrigin();if(token!==state.nearbyTransitToken)return;clearTimeout(state.nearbyTransitTimer);clearNearbyStopMarkers();clearTransitOverlay();
 if(!origin){state.transitPlanner={token,origin:null,destination:p,originStops:[],destinationStops:[],routes:[],loadingStops:false,loadingRoutes:false,error:'Не удалось определить точку отправления'};renderNearbyTransit();return}
 const planner={token,origin,destination:{lat:+p.lat,lon:+p.lon,display_name:p.display_name||''},originStops:null,destinationStops:null,routes:[],loadingStops:true,loadingRoutes:false,error:null,directRetry:0};state.transitPlanner=planner;renderNearbyTransit();requestPlannerStops(planner,'origin');requestPlannerStops(planner,'destination')
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


function navSpeak(text){
 if(!nav.sound||!text)return;
 if(window.RokinNative&&typeof window.RokinNative.speak==='function'){window.RokinNative.speak(String(text));return}
 try{if('speechSynthesis'in window){speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(String(text));u.lang='ru-RU';u.rate=1;speechSynthesis.speak(u)}}catch{}
}
function navStopSpeech(){
 if(window.RokinNative&&typeof window.RokinNative.stopSpeaking==='function')window.RokinNative.stopSpeaking();
 try{window.speechSynthesis?.cancel()}catch{}
}
function navSetNativeActive(active){
 if(window.RokinNative&&typeof window.RokinNative.setNavigationActive==='function')window.RokinNative.setNavigationActive(!!active)
}
function routeSegmentMeters(a,b){
 const lat=(+a[1]+ +b[1])/2*Math.PI/180,dx=(+b[0]- +a[0])*111320*Math.cos(lat),dy=(+b[1]- +a[1])*110540;return Math.hypot(dx,dy)
}
function buildRouteCumulative(coords){
 const cum=[0];for(let i=1;i<coords.length;i++)cum[i]=cum[i-1]+routeSegmentMeters(coords[i-1],coords[i]);return cum
}
function nearestVertexIndex(coord,coords){
 let best=0,dist=Infinity;for(let i=0;i<coords.length;i++){const d=distanceM({lat:+coord[1],lon:+coord[0]},{lat:+coords[i][1],lon:+coords[i][0]});if(d<dist){dist=d;best=i}}return best
}
function prepareNavRoute(route){
 const coords=Array.isArray(route?.geometry?.coordinates)?route.geometry.coordinates:[];
 nav.routeCoords=coords;nav.routeCum=buildRouteCumulative(coords);nav.totalDistance=nav.routeCum.at(-1)||Number(route?.distance)||0;nav.spoken.clear();nav.lastStepIndex=-1;
 const steps=(route?.legs||[]).flatMap(l=>Array.isArray(l.steps)?l.steps:[]);
 nav.maneuvers=steps.map((step,i)=>{
  const loc=step?.maneuver?.location||step?.geometry?.coordinates?.[0]||coords[0]||[0,0],idx=coords.length?nearestVertexIndex(loc,coords):0;
  return{step,index:i,coord:loc,routeIndex:idx,progress:nav.routeCum[idx]||0}
 }).sort((a,b)=>a.progress-b.progress)
}
function closestRoutePoint(lat,lon){
 const coords=nav.routeCoords,cum=nav.routeCum;if(!coords.length)return{distance:Infinity,progress:0,index:0,t:0,point:[lon,lat]};
 let best={distance:Infinity,progress:0,index:0,t:0,point:coords[0]},cos=Math.cos(lat*Math.PI/180);
 for(let i=0;i<coords.length-1;i++){
  const a=coords[i],b=coords[i+1],ax=(+a[0]-lon)*111320*cos,ay=(+a[1]-lat)*110540,bx=(+b[0]-lon)*111320*cos,by=(+b[1]-lat)*110540,dx=bx-ax,dy=by-ay,den=dx*dx+dy*dy;
  let t=den?-(ax*dx+ay*dy)/den:0;t=Math.max(0,Math.min(1,t));const px=ax+t*dx,py=ay+t*dy,d=Math.hypot(px,py);
  if(d<best.distance){const seg=routeSegmentMeters(a,b);best={distance:d,progress:(cum[i]||0)+seg*t,index:i,t,point:[+a[0]+(+b[0]-+a[0])*t,+a[1]+(+b[1]-+a[1])*t]}}
 }
 return best
}
function bearingBetween(a,b){
 const p1=+a.lat*Math.PI/180,p2=+b.lat*Math.PI/180,dl=(+b.lon-+a.lon)*Math.PI/180,y=Math.sin(dl)*Math.cos(p2),x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);return(Math.atan2(y,x)*180/Math.PI+360)%360
}
function maneuverIcon(step){
 const t=String(step?.maneuver?.type||''),m=String(step?.maneuver?.modifier||'');
 if(t==='arrive')return'●';if(t.includes('roundabout')||t==='rotary')return'↻';if(m.includes('left'))return m.includes('slight')?'↖':m.includes('sharp')?'↙':'←';if(m.includes('right'))return m.includes('slight')?'↗':m.includes('sharp')?'↘':'→';if(t==='uturn'||m==='uturn')return'↶';return'↑'
}
function maneuverText(step){
 const t=String(step?.maneuver?.type||''),m=String(step?.maneuver?.modifier||''),name=String(step?.name||'').trim(),onto=name?(' на '+name):'';
 if(t==='arrive')return'Вы прибыли';
 if(t==='depart')return name?('Начинайте движение по '+name):'Начинайте движение';
 if(t.includes('roundabout')||t==='rotary')return'Въезжайте на круговое движение'+onto;
 if(t==='merge')return m.includes('left')?'Перестройтесь левее'+onto:'Перестройтесь правее'+onto;
 if(t==='fork')return m.includes('left')?'Держитесь левее'+onto:'Держитесь правее'+onto;
 if(t==='end of road')return m.includes('left')?'В конце дороги поверните налево'+onto:'В конце дороги поверните направо'+onto;
 if(m.includes('left'))return m.includes('slight')?'Плавно поверните налево'+onto:m.includes('sharp')?'Резко поверните налево'+onto:'Поверните налево'+onto;
 if(m.includes('right'))return m.includes('slight')?'Плавно поверните направо'+onto:m.includes('sharp')?'Резко поверните направо'+onto:'Поверните направо'+onto;
 if(t==='new name'||t==='continue')return name?('Продолжайте по '+name):'Продолжайте движение';
 return name?('Следуйте по '+name):'Продолжайте движение'
}
function nextNavManeuver(progress){
 if(!nav.maneuvers.length)return null;
 for(const m of nav.maneuvers)if(m.progress>progress+8)return m;
 return nav.maneuvers.at(-1)
}
function navVoiceFor(m,dist){
 const instruction=maneuverText(m.step),rounded=dist<100?Math.max(10,Math.round(dist/10)*10):Math.max(100,Math.round(dist/50)*50);
 if(dist>80)return'Через '+rounded+' метров. '+instruction;
 return instruction
}
function maybeSpeakNav(m,dist){
 if(!m||!nav.sound)return;
 let band=null;if(dist<=60)band='now';else if(dist<=180)band='180';else if(dist<=550)band='500';if(!band)return;
 const key=m.index+':'+band;if(nav.spoken.has(key))return;
 if(band==='now'){nav.spoken.add(m.index+':180');nav.spoken.add(m.index+':500')}else if(band==='180')nav.spoken.add(m.index+':500');
 nav.spoken.add(key);navSpeak(navVoiceFor(m,dist))
}
function formatNavEta(seconds){
 const d=new Date(Date.now()+Math.max(0,seconds)*1000);return d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})
}
function setNavFollow(enabled){
 nav.follow=!!enabled;$('navRecenterBtn')?.classList.toggle('hidden',nav.follow)
}
function updateNavMarker(lat,lon,bearing){
 if(!map)return;
 if(!nav.marker){const el=document.createElement('div');el.className='nav-position-marker';el.innerHTML='<div class="nav-position-core"><div class="nav-position-arrow">▲</div></div>';nav.marker=new maplibregl.Marker({element:el,anchor:'center'}).setLngLat([lon,lat]).addTo(map)}
 else nav.marker.setLngLat([lon,lat]);
 const arrow=nav.marker.getElement().querySelector('.nav-position-arrow'),relative=(bearing-(map.getBearing()||0)+360)%360;if(arrow)arrow.style.transform='rotate('+relative+'deg)'
}
function navigationCamera(lat,lon,bearing,speed){
 if(!map||!nav.follow)return;
 const isWalk=state.mode==='foot',isBike=state.mode==='bike',zoom=isWalk?18.2:isBike?17.7:(speed>70?16.5:17.2),pitch=isWalk?40:55;
 map.easeTo({center:[lon,lat],zoom,bearing:Number.isFinite(bearing)?bearing:map.getBearing(),pitch,duration:550,essential:true,offset:[0,innerHeight<700?70:95]})
}
function updateNavigationHud(progress,closest,pos){
 const remaining=Math.max(0,nav.totalDistance-progress),ratio=nav.totalDistance?remaining/nav.totalDistance:0,remainingTime=Math.max(0,(Number(state.route?.duration)||0)*ratio),m=nextNavManeuver(progress),toManeuver=m?Math.max(0,m.progress-progress):remaining;
 $('navRemainingDistance').textContent=formatDistance(remaining);$('navRemainingTime').textContent=formatDuration(remainingTime);$('navEta').textContent=formatNavEta(remainingTime);$('navSpeed').textContent=String(Math.max(0,Math.round((Number(pos.coords.speed)||0)*3.6)));
 if(m){$('navManeuverIcon').textContent=maneuverIcon(m.step);$('navNextDistance').textContent=toManeuver<15?'Сейчас':formatDistance(toManeuver);$('navInstruction').textContent=maneuverText(m.step);$('navStreet').textContent=m.step?.name||'';maybeSpeakNav(m,toManeuver)}
}
function navigationArrived(){
 if(nav.completed)return;nav.completed=true;if(nav.watchId!=null){navigator.geolocation.clearWatch(nav.watchId);nav.watchId=null}
 navSetNativeActive(false);navStopSpeech();$('navigationUi')?.classList.add('arrived');$('navManeuverIcon').textContent='✓';$('navNextDistance').textContent='';$('navInstruction').textContent='Вы прибыли';$('navStreet').textContent=safeName(state.destination);$('navRemainingDistance').textContent='0 м';$('navRemainingTime').textContent='0 мин';$('navEta').textContent='—';$('navSpeed').textContent='0';navSpeak('Вы прибыли в пункт назначения')
}
async function rerouteNavigation(lat,lon){
 if(nav.rerouting||!state.destination||Date.now()-nav.lastRerouteAt<12000)return;nav.rerouting=true;nav.lastRerouteAt=Date.now();$('navRerouting').classList.remove('hidden');
 const a={lat,lon},b=state.destination,u=routeBase()+'/'+a.lon+','+a.lat+';'+b.lon+','+b.lat+'?overview=full&geometries=geojson&steps=true&alternatives=false';
 try{const r=await fetch(u);if(!r.ok)throw 0;const d=await r.json();if(d.code!=='Ok'||!d.routes?.length)throw 0;state.route=d.routes[0];map.getSource('route')?.setData({type:'Feature',properties:{},geometry:state.route.geometry});prepareNavRoute(state.route);nav.lastProgress=0;nav.spoken.clear();navSpeak('Маршрут перестроен')}
 catch{toast('Не удалось перестроить маршрут',2500)}
 finally{nav.rerouting=false;$('navRerouting').classList.add('hidden')}
}
function onNavigationPosition(pos){
 if(!nav.active||nav.completed||!state.route)return;
 const lat=pos.coords.latitude,lon=pos.coords.longitude,accuracy=Number(pos.coords.accuracy)||20,speed=Math.max(0,(Number(pos.coords.speed)||0)*3.6),current={lat,lon};
 let bearing=Number(pos.coords.heading);if(!Number.isFinite(bearing)&&nav.lastPos)bearing=bearingBetween(nav.lastPos,current);if(!Number.isFinite(bearing))bearing=nav.lastBearing||0;nav.lastBearing=bearing;nav.lastPos=current;
 const closest=closestRoutePoint(lat,lon);nav.lastProgress=Math.max(nav.lastProgress-40,closest.progress);
 updateNavMarker(lat,lon,bearing);updateNavigationHud(closest.progress,closest,pos);navigationCamera(lat,lon,bearing,speed);
 const destDistance=distanceM(current,{lat:+state.destination.lat,lon:+state.destination.lon});if(destDistance<40||nav.totalDistance-closest.progress<30){navigationArrived();return}
 const offThreshold=Math.max(55,accuracy*1.6);if(closest.distance>offThreshold)rerouteNavigation(lat,lon)
}
function navigationError(err){
 if(!nav.active)return;const msg=err?.code===1?'Нет разрешения на геолокацию':err?.code===2?'GPS временно недоступен':'Не удалось получить GPS';toast(msg,3500)
}
function startNavigation(){
 if(nav.active)return;if(!state.route||!state.destination){toast('Сначала постройте маршрут');return}if(!navigator.geolocation){toast('Геолокация недоступна');return}
 prepareNavRoute(state.route);if(!nav.routeCoords.length){toast('У маршрута нет геометрии');return}
 nav.active=true;nav.completed=false;nav.follow=true;nav.lastPos=null;nav.lastBearing=0;nav.lastProgress=0;nav.rerouting=false;nav.arrivedSpoken=false;nav.spoken.clear();
 document.body.classList.add('nav-active');$('navigationUi').classList.remove('hidden','arrived');$('navRecenterBtn').classList.add('hidden');$('navRerouting').classList.add('hidden');navSetNativeActive(true);
 if(nav.marker){nav.marker.remove();nav.marker=null}
 navSpeak('Навигация началась');$('navInstruction').textContent='Определяю положение…';$('navNextDistance').textContent='GPS';
 nav.watchId=navigator.geolocation.watchPosition(onNavigationPosition,navigationError,{enableHighAccuracy:true,maximumAge:1000,timeout:15000})
}
function stopNavigation(){
 if(!nav.active&&!nav.completed)return;
 if(nav.watchId!=null){navigator.geolocation.clearWatch(nav.watchId);nav.watchId=null}
 nav.active=false;nav.completed=false;navSetNativeActive(false);navStopSpeech();document.body.classList.remove('nav-active');$('navigationUi').classList.add('hidden');$('navigationUi').classList.remove('arrived');$('navRerouting').classList.add('hidden');
 if(nav.marker){nav.marker.remove();nav.marker=null}map?.easeTo({pitch:0,bearing:0,zoom:15.5,duration:650})
}
function toggleNavSound(){
 nav.sound=!nav.sound;$('navSoundBtn').textContent=nav.sound?'🔊':'🔇';if(!nav.sound)navStopSpeech();else navSpeak('Голосовые подсказки включены')
}

function toast(msg,ms=3000){const e=$('toast');e.textContent=msg;e.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.add('hidden'),ms)}
function setHint(t){$('hintText').textContent=t}function safeName(p){return p?.display_name||p?.name||'Точка на карте'}
function initMap(){if(!window.maplibregl){toast('Не удалось загрузить движок карты');return}map=new maplibregl.Map({container:'map',style:'https://tiles.openfreemap.org/styles/liberty',center:[73.3686,54.9893],zoom:11,attributionControl:false,maxPitch:70});['dragstart','zoomstart','rotatestart','pitchstart'].forEach(evt=>map.on(evt,e=>{if(nav.active&&e.originalEvent)setNavFollow(false)}));map.on('load',()=>{map.addSource('route',{type:'geojson',data:{type:'FeatureCollection',features:[]}});map.addLayer({id:'route-shadow',type:'line',source:'route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#0b1020','line-width':10,'line-opacity':.42}});map.addLayer({id:'route-line',type:'line',source:'route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#6d7dff','line-width':6}});map.addSource('transit-route',{type:'geojson',data:{type:'FeatureCollection',features:[]}});map.addLayer({id:'transit-route-shadow',type:'line',source:'transit-route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#101522','line-width':9,'line-opacity':.48}});map.addLayer({id:'transit-route-line',type:'line',source:'transit-route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#ffb84d','line-width':5,'line-opacity':.95}});startLiveTransport()});map.on('click',e=>{if(!$('searchModal').classList.contains('hidden'))return;const p={lat:e.lngLat.lat,lon:e.lngLat.lng,display_name:e.lngLat.lat.toFixed(5)+', '+e.lngLat.lng.toFixed(5)};if(!state.origin)setPlace('origin',p);else if(!state.destination)setPlace('destination',p)})}
function markerElement(kind){const e=document.createElement('div');e.className='marker-pin '+kind;return e}function setMarker(kind,p){if(state.markers[kind])state.markers[kind].remove();state.markers[kind]=new maplibregl.Marker({element:markerElement(kind),anchor:'bottom'}).setLngLat([+p.lon,+p.lat]).addTo(map)}
function setPlace(kind,p){state[kind]=p;setMarker(kind,p);const t=$(kind+'Text');t.textContent=safeName(p);t.classList.remove('muted');if(kind==='destination'){map.easeTo({center:[+p.lon,+p.lat],zoom:14,duration:650});loadNearbyTransitForPlace(p)}else if(kind==='origin'&&state.destination){loadNearbyTransitForPlace(state.destination)}if(state.origin&&state.destination)buildRoute();else setHint('Теперь выберите '+(state.origin?'пункт назначения':'точку отправления'))}
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
function reset(){if(nav.active||nav.completed)stopNavigation();['origin','destination'].forEach(k=>{state[k]=null;if(state.markers[k]){state.markers[k].remove();state.markers[k]=null}const e=$(k+'Text');e.textContent=k==='origin'?'Выберите точку':'Куда едем?';e.classList.add('muted')});state.route=null;state.nearbyTransit=null;state.transitPlanner=null;clearRouteLine();clearTransitOverlay();clearNearbyStopMarkers();closeNearbyTransit();setHint('Укажите начало и конец маршрута')}function swap(){const a=state.origin,b=state.destination;if(!a&&!b)return;if(state.markers.origin){state.markers.origin.remove();state.markers.origin=null}if(state.markers.destination){state.markers.destination.remove();state.markers.destination=null}state.origin=b;state.destination=a;['origin','destination'].forEach(k=>{const p=state[k],e=$(k+'Text');if(p){e.textContent=safeName(p);e.classList.remove('muted');setMarker(k,p)}else{e.textContent=k==='origin'?'Выберите точку':'Куда едем?';e.classList.add('muted')}});if(state.origin&&state.destination){buildRoute();loadNearbyTransitForPlace(state.destination)}else clearRouteLine()}
$('originBtn').onclick=()=>openSearch('origin');$('destinationBtn').onclick=()=>openSearch('destination');$('closeNearbyTransit').onclick=()=>{closeNearbyTransit();clearTransitOverlay();clearNearbyStopMarkers()};$('closeSearch').onclick=closeSearch;$('searchModal').onclick=e=>{if(e.target===$('searchModal'))closeSearch()};$('searchSubmit').onclick=()=>search($('searchInput').value);$('searchInput').onkeydown=e=>{if(e.key==='Enter')search(e.currentTarget.value)};$('locateBtn').onclick=locate;$('centerBtn').onclick=locate;$('swapBtn').onclick=swap;$('clearBtn').onclick=reset;$('zoomInBtn').onclick=()=>map?.zoomIn();$('zoomOutBtn').onclick=()=>map?.zoomOut();$('collapseBtn').onclick=()=>{const c=$('routeCard');c.classList.toggle('compact');$('collapseBtn').textContent=c.classList.contains('compact')?'⌃':'⌄'};document.querySelectorAll('.mode').forEach(b=>b.onclick=()=>{document.querySelectorAll('.mode').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.mode=b.dataset.mode;if(state.origin&&state.destination)buildRoute()});$('transportBtn').onclick=openTransport;$('closeTransport').onclick=closeTransport;$('transportModal').onclick=e=>{if(e.target===$('transportModal'))closeTransport()};$('startBtn').onclick=startNavigation;$('navExitBtn').onclick=stopNavigation;$('navSoundBtn').onclick=toggleNavSound;$('navRecenterBtn').onclick=()=>{setNavFollow(true);if(nav.lastPos)navigationCamera(nav.lastPos.lat,nav.lastPos.lon,nav.lastBearing,0)};window.RokinNavigationStop=stopNavigation;renderTransportPanel();initMap()})();