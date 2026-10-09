(() => {
  const Core = window.BahlCore;
  const svg = document.getElementById('cadCanvas');
  const root = document.getElementById('drawingRoot');
  const grid = document.getElementById('grid');
  const wrap = document.getElementById('canvasWrap');
  const commandInput = document.getElementById('commandInput');
  const commandHint = document.getElementById('commandHint');
  const statusMessage = document.getElementById('statusMessage');
  const coordReadout = document.getElementById('coordReadout');
  const snapBadge = document.getElementById('snapBadge');
  const constraintsEl = document.getElementById('constraints');
  const parametersEl = document.getElementById('parameters');
  const crosshair = document.getElementById('crosshair');
  const properties = document.getElementById('properties');
  const layersEl = document.getElementById('layers');
  const selectionCount = document.getElementById('selectionCount');
  const commandLog = document.getElementById('commandLog');
  const fileInput = document.getElementById('fileInput');

  const NS='http://www.w3.org/2000/svg';
  const state = {
    units:'mm', grid:true, snap:true, ortho:false, polar:false, tracking:false, dynamicInput:true, gridSize:50, majorGrid:250,
    layers:[{id:'layer-1',name:'Structural',visible:true,locked:false,color:'#111827'},{id:'layer-2',name:'Dimensions',visible:true,locked:false,color:'#1f4d95'},{id:'layer-3',name:'Text',visible:true,locked:false,color:'#8a5900'}],
    activeLayer:'Structural', entities:[], selection:[], tool:'select',
    constraints:[], parameters:[],
    viewport:{x:0,y:0,scale:1}, interaction:null, panKeyDown:false, nextId:1
  };

  const clone = o => JSON.parse(JSON.stringify(o));
  const uid=()=>`e${state.nextId++}`;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const history = new Core.HistoryManager({capture:captureDocument,restore:restoreDocument});
  const commands = new Core.CommandRegistry();
  function log(msg){ const d=document.createElement('div'); d.textContent=`› ${msg}`; commandLog.prepend(d); while(commandLog.children.length>80) commandLog.lastChild.remove(); }
  function setStatus(msg){statusMessage.textContent=msg;}
  function layerByName(name){return state.layers.find(l=>l.name===name)||state.layers[0]}
  function toScreen(p){return {x:p.x*state.viewport.scale+state.viewport.x,y:p.y*state.viewport.scale+state.viewport.y}}
  function toWorld(clientX,clientY){const r=svg.getBoundingClientRect(); return {x:(clientX-r.left-state.viewport.x)/state.viewport.scale,y:(clientY-r.top-state.viewport.y)/state.viewport.scale}}
  function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
  function snapPoint(p){
    const resolved=Core.snapPoint(p,state.entities,{
      threshold:10/state.viewport.scale,gridSize:state.gridSize,gridSnap:state.snap,
      objectSnap:state.snap,
      tracking:state.tracking,
      isVisible:e=>layerByName(e.layer).visible
    });
    const ref=state.interaction?.start||state.interaction?.points?.at(-1);
    if(ref&&state.ortho){const dx=resolved.p.x-ref.x,dy=resolved.p.y-ref.y;resolved.p=Math.abs(dx)>=Math.abs(dy)?{x:resolved.p.x,y:ref.y}:{x:ref.x,y:resolved.p.y};resolved.kind='ORTHO'}
    else if(ref&&state.polar){const dx=resolved.p.x-ref.x,dy=resolved.p.y-ref.y,r=Math.hypot(dx,dy),step=Math.PI/12,a=Math.round(Math.atan2(dy,dx)/step)*step;resolved.p={x:ref.x+Math.cos(a)*r,y:ref.y+Math.sin(a)*r};resolved.kind='POLAR'}
    return resolved;
  }
  function captureDocument(){return clone({units:state.units,layers:state.layers,activeLayer:state.activeLayer,entities:state.entities,nextId:state.nextId,constraints:state.constraints,parameters:state.parameters,grid:state.grid,snap:state.snap,ortho:state.ortho,polar:state.polar,tracking:state.tracking,dynamicInput:state.dynamicInput,gridSize:state.gridSize,majorGrid:state.majorGrid,viewport:state.viewport})}
  function restoreDocument(snapshot){Object.assign(state,clone(snapshot));state.selection=[];state.interaction=null;render()}
  function worldBounds(e){
    if(e.type==='line'||e.type==='dimension') return {x1:Math.min(e.a.x,e.b.x),y1:Math.min(e.a.y,e.b.y),x2:Math.max(e.a.x,e.b.x),y2:Math.max(e.a.y,e.b.y)};
    if(e.type==='arc'){const pts=arcSamples(e),xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);return{x1:Math.min(...xs),y1:Math.min(...ys),x2:Math.max(...xs),y2:Math.max(...ys)}}
    if(e.type==='rect'){const center={x:e.x+e.w/2,y:e.y+e.h/2},pts=[{x:e.x,y:e.y},{x:e.x+e.w,y:e.y},{x:e.x+e.w,y:e.y+e.h},{x:e.x,y:e.y+e.h}].map(p=>rotatedPoint(p,center,e.rotation||0)),xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);return{x1:Math.min(...xs),y1:Math.min(...ys),x2:Math.max(...xs),y2:Math.max(...ys)}}
    if(e.type==='circle') return {x1:e.cx-e.r,y1:e.cy-e.r,x2:e.cx+e.r,y2:e.cy+e.r};
    if(e.type==='ellipse'){const r=(e.rotation||0)*Math.PI/180,rx=Math.hypot(e.rx*Math.cos(r),e.ry*Math.sin(r)),ry=Math.hypot(e.rx*Math.sin(r),e.ry*Math.cos(r));return{x1:e.cx-rx,y1:e.cy-ry,x2:e.cx+rx,y2:e.cy+ry}}
    if(['polyline','polygon','spline','revcloud'].includes(e.type)){const xs=e.points.map(p=>p.x),ys=e.points.map(p=>p.y);return{x1:Math.min(...xs),y1:Math.min(...ys),x2:Math.max(...xs),y2:Math.max(...ys)}}
    if(e.type==='point') return {x1:e.x-2,y1:e.y-2,x2:e.x+2,y2:e.y+2};
    if(e.type==='text') return {x1:e.x,y1:e.y-20,x2:e.x+Math.max(50,(e.text||'').length*9),y2:e.y+8};
    return {x1:0,y1:0,x2:0,y2:0}
  }
  function setAttr(el,attrs){for(const [k,v] of Object.entries(attrs))if(v!==null&&v!==undefined)el.setAttribute(k,v)}
  function createEl(type,attrs,parent=root){const el=document.createElementNS(NS,type);setAttr(el,attrs);parent.appendChild(el);return el}
  function splinePath(points){if(points.length<2)return '';let d=`M ${points[0].x} ${points[0].y}`;for(let i=0;i<points.length-1;i++){const p0=points[Math.max(0,i-1)],p1=points[i],p2=points[i+1],p3=points[Math.min(points.length-1,i+2)];d+=` C ${p1.x+(p2.x-p0.x)/6} ${p1.y+(p2.y-p0.y)/6} ${p2.x-(p3.x-p1.x)/6} ${p2.y-(p3.y-p1.y)/6} ${p2.x} ${p2.y}`}return d}
  function arcGeometry(e){const {a,b,c}=e;const d=2*(a.x*(b.y-c.y)+b.x*(c.y-a.y)+c.x*(a.y-b.y));if(Math.abs(d)<1e-9)return null;const aa=a.x*a.x+a.y*a.y,bb=b.x*b.x+b.y*b.y,cc=c.x*c.x+c.y*c.y,cx=(aa*(b.y-c.y)+bb*(c.y-a.y)+cc*(a.y-b.y))/d,cy=(aa*(c.x-b.x)+bb*(a.x-c.x)+cc*(b.x-a.x))/d,r=Math.hypot(a.x-cx,a.y-cy),start=Math.atan2(a.y-cy,a.x-cx),mid=Math.atan2(b.y-cy,b.x-cx),end=Math.atan2(c.y-cy,c.x-cx),norm=x=>(x+Math.PI*2)%(Math.PI*2),sweep=norm(end-start),through=norm(mid-start);const large=sweep>Math.PI?1:0,actualSweep=through<=sweep?sweep:sweep-2*Math.PI;return {cx,cy,r,start,end: start+actualSweep,large:Math.abs(actualSweep)>Math.PI?1:0,sweep:actualSweep>=0?1:0}}
  function rotatedPoint(p,c,degrees){const a=degrees*Math.PI/180,dx=p.x-c.x,dy=p.y-c.y;return{x:c.x+dx*Math.cos(a)-dy*Math.sin(a),y:c.y+dx*Math.sin(a)+dy*Math.cos(a)}}
  function arcSamples(e){const g=arcGeometry(e);if(!g)return[e.a,e.b,e.c];return Array.from({length:25},(_,i)=>{const angle=g.start+(g.end-g.start)*i/24;return{x:g.cx+g.r*Math.cos(angle),y:g.cy+g.r*Math.sin(angle)}})}
  function cloudPath(points){if(points.length<2)return '';let d=`M ${points[0].x} ${points[0].y}`;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],len=dist(a,b);if(len<1e-9)continue;const n=Math.max(1,Math.ceil(len/24)),dx=(b.x-a.x)/n,dy=(b.y-a.y)/n,bulge=Math.min(8,len/(n*2));for(let j=0;j<n;j++){const x=a.x+dx*j,y=a.y+dy*j,mx=x+dx/2-dy/len*bulge,my=y+dy/2+dx/len*bulge;d+=` Q ${mx} ${my} ${x+dx} ${y+dy}`}}return `${d} Z`}
  function render(){
    root.innerHTML='';
    svg.setAttribute('viewBox',`0 0 ${wrap.clientWidth} ${wrap.clientHeight}`);
    grid.setAttribute('width','100%');grid.setAttribute('height','100%');grid.style.display=state.grid?'block':'none';
    document.getElementById('snapState').textContent=state.snap?'SNAP ON':'SNAP OFF';
    for(const [id,on] of [['snapToggle',state.snap],['orthoToggle',state.ortho],['polarToggle',state.polar],['trackingToggle',state.tracking],['dynamicToggle',state.dynamicInput],['gridToggle',state.grid]])document.getElementById(id).classList.toggle('active',on);
    for(const e of state.entities){
      const l=layerByName(e.layer); if(!l.visible) continue;
      const selected=state.selection.includes(e.id), common={class:selected?'selected':''};
      if(e.type==='line') createEl('line',{x1:e.a.x,y1:e.a.y,x2:e.b.x,y2:e.b.y,stroke:l.color,'stroke-width':2/commonScale(),'vector-effect':'non-scaling-stroke',...common});
      else if(e.type==='rect') createEl('rect',{x:e.x,y:e.y,width:e.w,height:e.h,transform:e.rotation?`rotate(${e.rotation} ${e.x+e.w/2} ${e.y+e.h/2})`:null,fill:e.fill||'none',stroke:l.color,'stroke-width':2,'vector-effect':'non-scaling-stroke',...common});
      else if(e.type==='circle') createEl('circle',{cx:e.cx,cy:e.cy,r:e.r,fill:e.fill||'none',stroke:l.color,'stroke-width':2,'vector-effect':'non-scaling-stroke',...common});
      else if(e.type==='ellipse') createEl('ellipse',{cx:e.cx,cy:e.cy,rx:e.rx,ry:e.ry,transform:e.rotation?`rotate(${e.rotation} ${e.cx} ${e.cy})`:null,fill:e.fill||'none',stroke:l.color,'stroke-width':2,'vector-effect':'non-scaling-stroke',...common});
      else if(e.type==='arc'){const g=arcGeometry(e);if(g)createEl('path',{d:`M ${e.a.x} ${e.a.y} A ${g.r} ${g.r} 0 ${g.large} ${g.sweep} ${e.c.x} ${e.c.y}`,fill:'none',stroke:l.color,'stroke-width':2,'vector-effect':'non-scaling-stroke',...common})}
      else if(e.type==='polyline'||e.type==='polygon') createEl(e.closed||e.type==='polygon'?'polygon':'polyline',{points:e.points.map(p=>`${p.x},${p.y}`).join(' '),fill:e.fill||'none',stroke:l.color,'stroke-width':2,'vector-effect':'non-scaling-stroke',...common});
      else if(e.type==='spline')createEl('path',{d:splinePath(e.points),fill:'none',stroke:l.color,'stroke-width':2,'vector-effect':'non-scaling-stroke',...common});
      else if(e.type==='revcloud')createEl('path',{d:cloudPath(e.points),fill:'none',stroke:l.color,'stroke-width':2,'vector-effect':'non-scaling-stroke',...common});
      else if(e.type==='point')createEl('circle',{cx:e.x,cy:e.y,r:3/commonScale(),fill:l.color,'vector-effect':'non-scaling-stroke',...common});
      else if(e.type==='text'){createEl('text',{x:e.x,y:e.y,'font-size':e.size||20,fill:l.color,'font-family':'Arial, sans-serif',...common}).textContent=e.text||'TEXT'}
      else if(e.type==='dimension') renderDimension(e,l.color,selected);
    }
    renderGrips();
    updateProperties();updateLayers();renderConstraintManager();updatePrecisionModes();applyViewport();
  }
  function updatePrecisionModes(){
    for(const [id,enabled] of [['snapToggle',state.snap],['orthoToggle',state.ortho],['polarToggle',state.polar],['trackingToggle',state.tracking],['dynamicToggle',state.dynamicInput],['gridToggle',state.grid]]){
      const button=document.getElementById(id);button.classList.toggle('active',enabled);button.setAttribute('aria-pressed',String(enabled));
    }
    coordReadout.hidden=!state.dynamicInput;
  }
  function commonScale(){return state.viewport.scale||1}
  function renderDimension(e,color,selected){
    const a=e.a,b=e.b;const dx=b.x-a.x,dy=b.y-a.y;const len=Math.hypot(dx,dy)||1;const nx=-dy/len,ny=dx/len;const off=e.offset||50;const p1={x:a.x+nx*off,y:a.y+ny*off},p2={x:b.x+nx*off,y:b.y+ny*off};
    createEl('line',{x1:a.x,y1:a.y,x2:p1.x,y2:p1.y,stroke:color,class:'ext-line','vector-effect':'non-scaling-stroke'});
    createEl('line',{x1:b.x,y1:b.y,x2:p2.x,y2:p2.y,stroke:color,class:'ext-line','vector-effect':'non-scaling-stroke'});
    createEl('line',{x1:p1.x,y1:p1.y,x2:p2.x,y2:p2.y,stroke:color,class:'dim-line','vector-effect':'non-scaling-stroke'});
    const ah=10;const ux=dx/len,uy=dy/len;
    createEl('polygon',{points:`${p1.x},${p1.y} ${p1.x+ux*ah-nx*3},${p1.y+uy*ah-ny*3} ${p1.x+ux*ah+nx*3},${p1.y+uy*ah+ny*3}`,fill:color,class:selected?'selected':''});
    createEl('polygon',{points:`${p2.x},${p2.y} ${p2.x-ux*ah-nx*3},${p2.y-uy*ah-ny*3} ${p2.x-ux*ah+nx*3},${p2.y-uy*ah+ny*3}`,fill:color,class:selected?'selected':''});
    const tx=(p1.x+p2.x)/2,ty=(p1.y+p2.y)/2-6;const t=createEl('text',{x:tx,y:ty,'text-anchor':'middle',class:'dim-text',fill:color,'font-family':'Arial, sans-serif'});t.textContent=`${Math.round(len)} mm`;
  }
  function applyViewport(){root.setAttribute('transform',`translate(${state.viewport.x} ${state.viewport.y}) scale(${state.viewport.scale})`)}
  function updateLayers(){layersEl.innerHTML='';for(const l of state.layers){const row=document.createElement('div');row.className='layer-row'+(l.name===state.activeLayer?' active':'');row.innerHTML=`<span class="layer-eye">${l.visible?'◉':'○'}</span><span class="layer-swatch" style="background:${l.color}"></span><span class="layer-name">${l.name}</span><span class="layer-count">${state.entities.filter(e=>e.layer===l.name).length}</span>`;row.addEventListener('click',()=>{state.activeLayer=l.name;render();log(`Layer set to ${l.name}`)});row.querySelector('.layer-eye').addEventListener('click',(ev)=>{ev.stopPropagation();l.visible=!l.visible;render()});layersEl.appendChild(row)}}
  function renderConstraintManager(){
    constraintsEl.innerHTML=state.constraints.length?'':'<div class="properties-empty">Select a line and add a dimensional or geometric constraint.</div>';
    for(const c of state.constraints){const row=document.createElement('div');row.className='manager-row';row.innerHTML=`<span>${escapeHtml(c.type)} · ${escapeHtml(c.entityId)}</span><button type="button" aria-label="Remove constraint">×</button>`;row.querySelector('button').addEventListener('click',()=>{history.transact('REMOVE CONSTRAINT',()=>{state.constraints=state.constraints.filter(x=>x.id!==c.id)});render()});constraintsEl.appendChild(row)}
    parametersEl.innerHTML=state.parameters.length?'':'<div class="properties-empty">No named parameters.</div>';
    for(const p of state.parameters){const row=document.createElement('div');row.className='parameter-row';row.innerHTML=`<label>${escapeHtml(p.name)}</label><input type="number" step="any" value="${Number(p.value)}"><button type="button" aria-label="Remove parameter">×</button>`;row.querySelector('input').addEventListener('change',ev=>{const value=Number(ev.target.value);if(!Number.isFinite(value)||value<=0){setStatus('Parameter value must be a positive number.');render();return}history.transact('EDIT PARAMETER',()=>{p.value=value;for(const c of state.constraints.filter(x=>x.parameter===p.name))applyConstraint(c)});render()});row.querySelector('button').addEventListener('click',()=>{history.transact('REMOVE PARAMETER',()=>{state.parameters=state.parameters.filter(x=>x.id!==p.id);state.constraints.forEach(c=>{if(c.parameter===p.name)delete c.parameter})});render()});parametersEl.appendChild(row)}
  }
  function applyConstraint(c){
    const e=state.entities.find(x=>x.id===c.entityId);if(!e||e.type!=='line')return;
    if(c.type==='Horizontal')e.b.y=e.a.y;
    else if(c.type==='Vertical')e.b.x=e.a.x;
    else if(c.type==='Length'){const p=state.parameters.find(x=>x.name===c.parameter),length=p?.value??c.value,dx=e.b.x-e.a.x,dy=e.b.y-e.a.y,current=Math.hypot(dx,dy)||1;e.b={x:e.a.x+dx/current*length,y:e.a.y+dy/current*length};c.value=length}
  }
  function addConstraint(){
    const e=selectedEntity();if(!e||e.type!=='line'){setStatus('Select one line to constrain.');return}
    const type=window.prompt('Constraint type: Horizontal, Vertical, or Length','Horizontal');if(!type)return;
    const normalized=type.trim().toLowerCase(),mapped={horizontal:'Horizontal',vertical:'Vertical',length:'Length',distance:'Length'}[normalized];if(!mapped){setStatus('Use Horizontal, Vertical, or Length.');return}
    let value,parameter;
    if(mapped==='Length'){value=Number(window.prompt('Target length (mm):',String(dist(e.a,e.b))));if(!Number.isFinite(value)||value<=0){setStatus('Length must be a positive number.');return}parameter=window.prompt('Parameter name (optional):','D'+(state.parameters.length+1))||undefined;if(parameter&&state.parameters.some(p=>p.name===parameter)){setStatus('Parameter name already exists.');return}}
    history.transact(`${mapped.toUpperCase()} CONSTRAINT`,()=>{if(parameter)state.parameters.push({id:`p${uid()}`,name:parameter,value});const c={id:`c${uid()}`,type:mapped,entityId:e.id,value,parameter};state.constraints.push(c);applyConstraint(c);e.modifiedAt=new Date().toISOString()});render();setStatus(`${mapped} constraint applied to ${e.id}.`)
  }
  function addParameter(){const name=window.prompt('Parameter name:','P'+(state.parameters.length+1));if(!name)return;if(state.parameters.some(p=>p.name===name)){setStatus('Parameter name already exists.');return}const value=Number(window.prompt('Parameter value:','100'));if(!Number.isFinite(value)||value<=0){setStatus('Parameter value must be a positive number.');return}history.transact('CREATE PARAMETER',()=>state.parameters.push({id:`p${uid()}`,name,value}));render()}
  function updateProperties(){selectionCount.textContent=`${state.selection.length} selected`;if(state.selection.length!==1){properties.innerHTML=state.selection.length?'Multiple objects selected.':'Select an object to inspect its geometry.';return}const e=state.entities.find(x=>x.id===state.selection[0]);if(!e){properties.textContent='';return}
    const fields=[];fields.push(propSelect('Layer','layer',state.layers.map(l=>l.name),e.layer));
    if(e.type==='line'){fields.push(propInput('Start X','a.x',e.a.x),propInput('Start Y','a.y',e.a.y),propInput('End X','b.x',e.b.x),propInput('End Y','b.y',e.b.y))}
    else if(e.type==='rect'){fields.push(propInput('X','x',e.x),propInput('Y','y',e.y),propInput('Width','w',e.w),propInput('Height','h',e.h))}
    else if(e.type==='circle'){fields.push(propInput('Center X','cx',e.cx),propInput('Center Y','cy',e.cy),propInput('Radius','r',e.r))}
    else if(e.type==='ellipse'){fields.push(propInput('Center X','cx',e.cx),propInput('Center Y','cy',e.cy),propInput('Radius X','rx',e.rx),propInput('Radius Y','ry',e.ry))}
    else if(e.type==='point'){fields.push(propInput('X','x',e.x),propInput('Y','y',e.y))}
    else if(['polyline','polygon','spline','revcloud'].includes(e.type)){fields.push(propInput('Vertex count','points.length',e.points.length))}
    else if(e.type==='text'){fields.push(propInput('X','x',e.x),propInput('Y','y',e.y),propInput('Text','text',e.text),propInput('Size','size',e.size||20))}
    else if(e.type==='dimension'){fields.push(propInput('Offset','offset',e.offset||50))}
    properties.innerHTML=`<div style="font-size:11px;font-weight:700;margin-bottom:8px">${e.type.toUpperCase()} <span style="color:#9aa2af">${e.id}</span></div><div class="prop-grid">${fields.join('')}</div>`;
    properties.querySelectorAll('input,select').forEach(inp=>inp.addEventListener('change',()=>{history.transact('EDIT PROPERTY',()=>{setNested(e,inp.dataset.key,inp.value,inp.type==='number');if(inp.dataset.key==='layer')e.layerId=layerByName(e.layer).id;e.modifiedAt=new Date().toISOString()});render();log(`Edited ${e.id}.${inp.dataset.key}`)}));
  }
  function propInput(label,key,value){return `<div class="prop"><label>${label}</label><input data-key="${key}" type="${typeof value==='number'?'number':'text'}" step="any" value="${escapeHtml(value)}" /></div>`}
  function propSelect(label,key,options,value){return `<div class="prop"><label>${label}</label><select data-key="${key}">${options.map(o=>`<option ${o===value?'selected':''}>${o}</option>`).join('')}</select></div>`}
  function setNested(o,key,val,num){const parts=key.split('.');let ref=o;for(let i=0;i<parts.length-1;i++)ref=ref[parts[i]];if(parts.at(-1)==='length')return;ref[parts.at(-1)]=num?Number(val):val}
  function escapeHtml(v){return String(v??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;')}
  function addEntity(e){history.transact(`CREATE ${e.type}`,()=>{e.id=uid();e.layer=e.layer||state.activeLayer;e.layerId=layerByName(e.layer).id;e.visible=true;e.locked=false;e.color='BYLAYER';e.linetype='BYLAYER';e.lineweight=null;e.transparency=0;e.attributes={};e.metadata={};e.transform={x:0,y:0,z:0,rotation:0,scaleX:1,scaleY:1};e.createdAt=new Date().toISOString();e.modifiedAt=e.createdAt;state.entities.push(e);state.selection=[e.id]});render()}
  function setTool(tool){state.tool=tool;state.interaction=null;document.querySelectorAll('.tool[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));const names={select:'Select',line:'Line',polyline:'Polyline',rect:'Rectangle',circle:'Circle',text:'Text',dimension:'Dimension',arc:'Arc (start, point on arc, end)',ellipse:'Ellipse (center, x radius, y radius)',polygon:'Polygon',spline:'Spline',hatch:'Hatch',gradient:'Gradient',point:'Point',revcloud:'Revision cloud'};commandHint.textContent=tool==='select'?'Select an object or start drawing.':`${names[tool]||tool} — click points on the canvas.`;log(`Tool: ${tool.toUpperCase()}`)}
  function beginTool(point,additive=false,precise=false){
    if(state.tool==='select'){state.interaction={kind:'select-box',start:point,current:point,additive};return}
    const p=precise?point:snapPoint(point).p;
    if(['line','rect','circle','dimension','arc','ellipse','polygon','polyline','spline','revcloud'].includes(state.tool)){
      const kind=state.tool,i=state.interaction;
      if(i&&i.kind===kind){if(['polyline','spline','revcloud'].includes(kind))setStatus(`${kind}: click next point, Enter to finish.`);else if(kind==='arc')setStatus(i.points.length===1?'Arc: specify a point on the arc.':'Arc: specify end point.');else if(kind==='ellipse')setStatus(i.points.length===1?'Ellipse: specify horizontal radius.':'Ellipse: specify vertical radius.');return}
      if(kind==='polygon'){const sides=Number(window.prompt('Number of polygon sides:','6'));if(!Number.isInteger(sides)||sides<3||sides>128)return;state.interaction={kind,start:p,points:[p],sides};setStatus(`Polygon: specify radius for ${sides} sides.`);return}
      state.interaction={kind,start:p,points:[p],current:p};setStatus(`${kind}: specify next point${kind==='arc'?' (point on arc, then end)':kind==='ellipse'?' (x radius, then y radius)':''}.`);return
    }
    if(state.tool==='point'){addEntity({type:'point',x:p.x,y:p.y});return}
    if(state.tool==='hatch'||state.tool==='gradient'){applyFill(state.tool);return}
    if(state.tool==='text'){const text=window.prompt('Text to place:','BEAM B1');if(text){addEntity({type:'text',x:point.x,y:point.y,text,size:20});log(`TEXT created: ${text}`)}return}
  }
  function updateTool(point){if(!state.interaction)return;state.interaction.current=point;renderPreview()}
  function endTool(point,precise=false){if(!state.interaction)return;const i=state.interaction;point=precise?point:snapPoint(point).p;
    if(i.kind==='line'){if(dist(i.start,point)>1)addEntity({type:'line',a:i.start,b:point});log('LINE created');state.interaction=null;setTool('select')}
    else if(i.kind==='rect'){const w=point.x-i.start.x,h=point.y-i.start.y;if(Math.abs(w)>1&&Math.abs(h)>1)addEntity({type:'rect',x:i.start.x,y:i.start.y,w,h});log('RECT created');state.interaction=null;setTool('select')}
    else if(i.kind==='circle'){const r=dist(i.start,point);if(r>1)addEntity({type:'circle',cx:i.start.x,cy:i.start.y,r});log('CIRCLE created');state.interaction=null;setTool('select')}
    else if(i.kind==='dimension'){const len=dist(i.start,point);if(len>1)addEntity({type:'dimension',a:i.start,b:point,offset:60});log('DIMENSION created');state.interaction=null;setTool('select')}
    else if(i.kind==='arc'){i.points.push(point);if(i.points.length===3){const entity={type:'arc',a:i.points[0],b:i.points[1],c:i.points[2]};if(arcGeometry(entity))addEntity(entity);else setStatus('Arc points cannot be collinear.');state.interaction=null;setTool('select')}else setStatus('Arc: specify end point.')}
    else if(i.kind==='ellipse'){i.points.push(point);if(i.points.length===2){i.rx=Math.abs(point.x-i.start.x);i.ry=Math.abs(point.y-i.start.y);setStatus('Ellipse: specify vertical radius.')}else if(i.points.length===3){const rx=Math.max(1,Math.abs(i.points[1].x-i.start.x)),ry=Math.max(1,Math.abs(point.y-i.start.y));addEntity({type:'ellipse',cx:i.start.x,cy:i.start.y,rx,ry});state.interaction=null;setTool('select')}}
    else if(i.kind==='polygon'){const radius=dist(i.start,point);if(radius>1){const points=Array.from({length:i.sides},(_,n)=>{const a=-Math.PI/2+n*Math.PI*2/i.sides;return{x:i.start.x+Math.cos(a)*radius,y:i.start.y+Math.sin(a)*radius}});addEntity({type:'polygon',closed:true,points})}state.interaction=null;setTool('select')}
    else if(['polyline','spline','revcloud'].includes(i.kind)){i.points.push(point);renderPreview()}
  }
  function finishPolyline(){const i=state.interaction;if(!i||!['polyline','spline','revcloud'].includes(i.kind))return;if(i.points.length>1){const type=i.kind==='revcloud'?'revcloud':i.kind;addEntity({type,points:i.points,closed:type==='revcloud'});log(`${type.toUpperCase()} created`)}state.interaction=null;setTool('select');render()}
  function applyFill(type){const closed=state.entities.filter(e=>state.selection.includes(e.id)&&(['rect','circle','ellipse','polygon'].includes(e.type)||(e.type==='polyline'&&e.closed)));if(!closed.length){setStatus(`Select a closed boundary before using ${type}.`);return}history.transact(type.toUpperCase(),()=>closed.forEach(e=>{e.fill=type==='hatch'?'url(#hatchPattern)':'url(#gradientFill)';e.modifiedAt=new Date().toISOString()}));render();setStatus(`${type} applied to ${closed.length} boundary.`)}
  function renderPreview(){render();const i=state.interaction;if(!i)return;const layer=layerByName(state.activeLayer),p=i.current||i.start,g=root,points=i.points||[];if(i.kind==='line')createEl('line',{x1:i.start.x,y1:i.start.y,x2:p.x,y2:p.y,stroke:layer.color,'stroke-dasharray':'6 4','stroke-width':1.5},g);else if(i.kind==='rect')createEl('rect',{x:i.start.x,y:i.start.y,width:p.x-i.start.x,height:p.y-i.start.y,fill:'none',stroke:layer.color,'stroke-dasharray':'6 4','stroke-width':1.5},g);else if(i.kind==='circle')createEl('circle',{cx:i.start.x,cy:i.start.y,r:dist(i.start,p),fill:'none',stroke:layer.color,'stroke-dasharray':'6 4','stroke-width':1.5},g);else if(i.kind==='ellipse')createEl('ellipse',{cx:i.start.x,cy:i.start.y,rx:Math.abs((points[1]||p).x-i.start.x),ry:Math.abs(p.y-i.start.y),fill:'none',stroke:layer.color,'stroke-dasharray':'6 4'},g);else if(i.kind==='dimension')renderDimension({a:i.start,b:p,offset:60},layer.color,false);else if(['polyline','polygon','spline','revcloud'].includes(i.kind)){const previewPoints=[...points,p];if(i.kind==='spline')createEl('path',{d:splinePath(previewPoints),fill:'none',stroke:layer.color,'stroke-dasharray':'6 4'},g);else createEl('polyline',{points:previewPoints.map(q=>`${q.x},${q.y}`).join(' '),fill:'none',stroke:layer.color,'stroke-dasharray':'6 4'},g)}else if(i.kind==='arc'){const previewPoints=[...points,p];createEl('polyline',{points:previewPoints.map(q=>`${q.x},${q.y}`).join(' '),fill:'none',stroke:layer.color,'stroke-dasharray':'6 4'},g)}else if(i.kind==='select-box'){const x=Math.min(i.start.x,p.x),y=Math.min(i.start.y,p.y),w=Math.abs(i.start.x-p.x),h=Math.abs(i.start.y-p.y);createEl('rect',{x,y,width:w,height:h,class:p.x>=i.start.x?'window-select':'crossing-select','pointer-events':'none'})}}
  function gripPoints(e){if(e.type==='line'||e.type==='dimension')return[{key:'a',p:e.a},{key:'b',p:e.b}];if(e.type==='rect'){const c={x:e.x+e.w/2,y:e.y+e.h/2};return[{key:'nw',p:{x:e.x,y:e.y}},{key:'ne',p:{x:e.x+e.w,y:e.y}},{key:'se',p:{x:e.x+e.w,y:e.y+e.h}},{key:'sw',p:{x:e.x,y:e.y+e.h}}].map(g=>({...g,p:rotatedPoint(g.p,c,e.rotation||0)}))}if(e.type==='circle')return[{key:'center',p:{x:e.cx,y:e.cy}},{key:'radius',p:{x:e.cx+e.r,y:e.cy}}];if(e.type==='ellipse'){const c={x:e.cx,y:e.cy};return[{key:'center',p:c},{key:'x-radius',p:rotatedPoint({x:e.cx+e.rx,y:e.cy},c,e.rotation||0)},{key:'y-radius',p:rotatedPoint({x:e.cx,y:e.cy+e.ry},c,e.rotation||0)}]}if(['polyline','polygon','spline','revcloud'].includes(e.type))return e.points.map((p,index)=>({key:String(index),p}));if(e.type==='point')return[{key:'point',p:{x:e.x,y:e.y}}];return[]}
  function renderGrips(){for(const id of state.selection){const e=state.entities.find(entity=>entity.id===id);if(!e)continue;for(const grip of gripPoints(e))createEl('circle',{cx:grip.p.x,cy:grip.p.y,r:5/state.viewport.scale,class:'cad-grip','data-entity-id':e.id,'data-grip':grip.key,'vector-effect':'non-scaling-stroke'});}}
  function hitTest(p){let hit=null,best=10/state.viewport.scale;for(const e of [...state.entities].reverse()){const l=layerByName(e.layer);if(!l.visible||l.locked||e.locked||e.visible===false)continue;const d=entityDistance(p,e);if(d<best){best=d;hit=e}}return hit}
  function boundsContain(outer,inner){return inner.x1>=outer.x1&&inner.y1>=outer.y1&&inner.x2<=outer.x2&&inner.y2<=outer.y2}
  function boundsIntersect(a,b){return a.x1<=b.x2&&a.x2>=b.x1&&a.y1<=b.y2&&a.y2>=b.y1}
  function selectInBox(start,end,additive){const box={x1:Math.min(start.x,end.x),y1:Math.min(start.y,end.y),x2:Math.max(start.x,end.x),y2:Math.max(start.y,end.y)};const crossing=end.x<start.x;const found=state.entities.filter(e=>{const layer=layerByName(e.layer);if(!layer.visible||layer.locked||e.locked||e.visible===false)return false;const bounds=worldBounds(e);return crossing?boundsIntersect(box,bounds):boundsContain(box,bounds)}).map(e=>e.id);state.selection=additive?[...new Set([...state.selection,...found])]:found;render();setStatus(`${state.selection.length} object${state.selection.length===1?'':'s'} selected (${crossing?'crossing':'window'}).`)}
  function updateGrip(entity,key,point,original){if(entity.type==='line'||entity.type==='dimension')entity[key]={...point};else if(entity.type==='circle'){if(key==='center'){entity.cx=point.x;entity.cy=point.y}else entity.r=dist({x:entity.cx,y:entity.cy},point)}else if(entity.type==='ellipse'){if(key==='center'){entity.cx=point.x;entity.cy=point.y}else if(key==='x-radius')entity.rx=Math.abs(point.x-entity.cx);else entity.ry=Math.abs(point.y-entity.cy)}else if(entity.type==='rect'){const opposite={nw:{x:original.x+original.w,y:original.y+original.h},ne:{x:original.x,y:original.y+original.h},se:{x:original.x,y:original.y},sw:{x:original.x+original.w,y:original.y}}[key];entity.x=Math.min(point.x,opposite.x);entity.y=Math.min(point.y,opposite.y);entity.w=Math.abs(point.x-opposite.x);entity.h=Math.abs(point.y-opposite.y)}else if(['polyline','polygon','spline','revcloud'].includes(entity.type))entity.points[Number(key)]={...point};else if(entity.type==='point'){entity.x=point.x;entity.y=point.y}entity.modifiedAt=new Date().toISOString()}
  function entityDistance(p,e){if(e.type==='line'||e.type==='dimension')return pointSeg(p,e.a,e.b);if(e.type==='arc'){const pts=arcSamples(e);return Math.min(...pts.slice(1).map((q,i)=>pointSeg(p,pts[i],q)))}if(e.type==='rect'){const c={x:e.x+e.w/2,y:e.y+e.h/2},pts=[{x:e.x,y:e.y},{x:e.x+e.w,y:e.y},{x:e.x+e.w,y:e.y+e.h},{x:e.x,y:e.y+e.h}].map(x=>rotatedPoint(x,c,e.rotation||0)),edges=pts.map((x,i)=>[x,pts[(i+1)%4]]);return Math.min(...edges.map(x=>pointSeg(p,x[0],x[1])))}if(e.type==='circle')return Math.abs(dist(p,{x:e.cx,y:e.cy})-e.r);if(e.type==='ellipse'){const local=rotatedPoint(p,{x:e.cx,y:e.cy},-(e.rotation||0)),t=Math.atan2((local.y-e.cy)*e.rx,(local.x-e.cx)*e.ry),closest=rotatedPoint({x:e.cx+e.rx*Math.cos(t),y:e.cy+e.ry*Math.sin(t)},{x:e.cx,y:e.cy},e.rotation||0);return dist(p,closest)}if(['polyline','polygon','spline','revcloud'].includes(e.type))return Math.min(...e.points.slice(1).map((q,i)=>pointSeg(p,e.points[i],q)));if(e.type==='point')return dist(p,{x:e.x,y:e.y});if(e.type==='text')return dist(p,{x:e.x,y:e.y});return 9999}
  function pointSeg(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);return dist(p,{x:a.x+t*dx,y:a.y+t*dy})}
  function registerCommands(){
    const drawing=(tool)=>()=>setTool(tool);
    for(const [name,aliases,tool] of [['SELECT',['V'],'select'],['LINE',['L'],'line'],['POLYLINE',['PL'],'polyline'],['RECTANGLE',['REC','RECT'],'rect'],['CIRCLE',['C'],'circle'],['ARC',[],'arc'],['ELLIPSE',['EL'],'ellipse'],['TEXT',['T'],'text'],['DIMENSION',['D'],'dimension'],['POLYGON',['POL'],'polygon'],['SPLINE',['SPL'],'spline'],['HATCH',[],'hatch'],['GRADIENT',['GRAD'],'gradient'],['POINT',['PO'],'point'],['REVCLOUD',[],'revcloud']])commands.register(name,aliases,drawing(tool));
    commands.register('MOVE',['M'],modifyMove);commands.register('COPY',['CO'],modifyCopy);commands.register('OFFSET',['O'],modifyOffset);commands.register('ROTATE',['RO','R'],modifyRotate);commands.register('SCALE',['SC'],modifyScale);commands.register('MIRROR',['MI'],modifyMirror);commands.register('TRIM',['TR'],()=>modifyTrim(false));commands.register('EXTEND',['EX'],()=>modifyTrim(true));commands.register('FILLET',['F'],modifyFillet);commands.register('CHAMFER',['CHA'],modifyChamfer);commands.register('STRETCH',['S'],modifyStretch);commands.register('ARRAYRECT',['ARRAY','AR'],()=>modifyArray('rect'));commands.register('ARRAYPOLAR',[],()=>modifyArray('polar'));commands.register('ARRAYPATH',[],()=>modifyArray('path'));commands.register('BREAK',['BR'],modifyBreak);commands.register('JOIN',['J'],modifyJoin);commands.register('EXPLODE',['X'],modifyExplode);commands.register('DELETE',['DEL','ERASE'],deleteSelection);
    commands.register('UNDO',['U'],()=>{const label=history.undo();if(label){setStatus(`Undo ${label}.`);log(`UNDO ${label}`)}});commands.register('REDO',['Y'],()=>{const label=history.redo();if(label){setStatus(`Redo ${label}.`);log(`REDO ${label}`)}});
    commands.register('SNAP',[],()=>{state.snap=!state.snap;document.getElementById('snapState').textContent=state.snap?'SNAP ON':'SNAP OFF';render()});commands.register('ZOOM',['ZE'],fitView);
  }
  function command(cmd){return commands.execute(cmd,state)}
  function selectedEntity(){return state.entities.find(e=>state.selection.includes(e.id))}
  function modifyMove(){if(!state.selection.length){setStatus('Select objects first.');return}state.interaction={kind:'move',entityIds:[...state.selection],start:null,current:null};setStatus('Move: pick base point.');commandHint.textContent='Pick a base point, then a destination.'}
  function modifyCopy(){if(!state.selection.length){setStatus('Select objects first.');return}state.interaction={kind:'copy',entityIds:[...state.selection],start:null,current:null};setStatus('Copy: pick base point.');commandHint.textContent='Pick a base point, then a destination.'}
  function modifyOffset(){const e=selectedEntity();if(!e||e.type!=='line'){setStatus('Offset currently supports a selected line.');return}const d=Number(window.prompt('Offset distance (mm):','100'));if(!Number.isFinite(d)||d===0)return;const dx=e.b.x-e.a.x,dy=e.b.y-e.a.y,len=Math.hypot(dx,dy);if(len<1e-9){setStatus('Cannot offset a zero-length line.');return}const nx=-dy/len*d,ny=dx/len*d;addEntity({type:'line',a:{x:e.a.x+nx,y:e.a.y+ny},b:{x:e.b.x+nx,y:e.b.y+ny}});log(`OFFSET ${e.id} by ${d} mm`);setTool('select')}
  function selectedEntities(){return state.selection.map(id=>state.entities.find(e=>e.id===id)).filter(Boolean)}
  function selectionCenter(entities=selectedEntities()){const bs=entities.map(worldBounds);return{x:(Math.min(...bs.map(b=>b.x1))+Math.max(...bs.map(b=>b.x2)))/2,y:(Math.min(...bs.map(b=>b.y1))+Math.max(...bs.map(b=>b.y2)))/2}}
  function modifyRotate(){const entities=selectedEntities();if(!entities.length){setStatus('Select objects first.');return}const deg=Number(window.prompt('Rotation angle (degrees):','90'));if(!Number.isFinite(deg))return;const c=selectionCenter(entities);history.transact('ROTATE',()=>entities.forEach(e=>{rotateEntity(e,c,deg);e.modifiedAt=new Date().toISOString()}));render();log(`ROTATE ${entities.length} object(s) ${deg}°`)}
  function rotateEntity(e,c,deg){const r=deg*Math.PI/180,rot=p=>({x:c.x+(p.x-c.x)*Math.cos(r)-(p.y-c.y)*Math.sin(r),y:c.y+(p.x-c.x)*Math.sin(r)+(p.y-c.y)*Math.cos(r)});if(e.type==='line'||e.type==='dimension'){e.a=rot(e.a);e.b=rot(e.b)}else if(e.type==='arc'){e.a=rot(e.a);e.b=rot(e.b);e.c=rot(e.c)}else if(e.type==='rect'){const p=rot({x:e.x+e.w/2,y:e.y+e.h/2});e.x=p.x-e.w/2;e.y=p.y-e.h/2;e.rotation=(e.rotation||0)+deg}else if(e.type==='circle'||e.type==='ellipse'){const p=rot({x:e.cx,y:e.cy});e.cx=p.x;e.cy=p.y;if(e.type==='ellipse')e.rotation=(e.rotation||0)+deg}else if(['polyline','polygon','spline','revcloud'].includes(e.type))e.points=e.points.map(rot);else if(e.type==='text'||e.type==='point'){const p=rot({x:e.x,y:e.y});e.x=p.x;e.y=p.y}}
  function modifyScale(){const entities=selectedEntities();if(!entities.length){setStatus('Select objects first.');return}const factor=Number(window.prompt('Scale factor (> 0):','2'));if(!Number.isFinite(factor)||factor<=0){setStatus('Scale factor must be positive.');return}const c=selectionCenter(entities);history.transact('SCALE',()=>entities.forEach(e=>{scaleEntity(e,c,factor);e.modifiedAt=new Date().toISOString()}));render()}
  function modifyStretch(){const entities=selectedEntities();if(!entities.length){setStatus('Select a line or polyline to stretch.');return}if(entities.some(e=>!['line','polyline'].includes(e.type))){setStatus('Stretch currently supports selected lines and polylines.');return}const dx=Number(window.prompt('Stretch delta X (mm):','0')),dy=Number(window.prompt('Stretch delta Y (mm):','100'));if(!Number.isFinite(dx)||!Number.isFinite(dy)||(dx===0&&dy===0))return;const ends=entities.map(e=>({e,index:e.type==='line'?(dist(state.lastWorldPoint||e.a,e.a)<=dist(state.lastWorldPoint||e.b,e.b)?0:1):(dist(state.lastWorldPoint||e.points[0],e.points[0])<=dist(state.lastWorldPoint||e.points.at(-1),e.points.at(-1))?0:e.points.length-1)}));history.transact('STRETCH',()=>ends.forEach(({e,index})=>{const p=e.type==='line'?e[index===0?'a':'b']:e.points[index];p.x+=dx;p.y+=dy;e.modifiedAt=new Date().toISOString()}));render()}
  function scaleEntity(e,c,f){const s=p=>({x:c.x+(p.x-c.x)*f,y:c.y+(p.y-c.y)*f});if(e.type==='line'||e.type==='dimension'){e.a=s(e.a);e.b=s(e.b)}else if(e.type==='arc'){e.a=s(e.a);e.b=s(e.b);e.c=s(e.c)}else if(e.type==='rect'){const p=s({x:e.x,y:e.y});e.x=p.x;e.y=p.y;e.w*=f;e.h*=f}else if(e.type==='circle'){const p=s({x:e.cx,y:e.cy});e.cx=p.x;e.cy=p.y;e.r*=f}else if(e.type==='ellipse'){const p=s({x:e.cx,y:e.cy});e.cx=p.x;e.cy=p.y;e.rx*=f;e.ry*=f}else if(['polyline','polygon','spline','revcloud'].includes(e.type))e.points=e.points.map(s);else if(e.type==='point'||e.type==='text'){const p=s({x:e.x,y:e.y});e.x=p.x;e.y=p.y;if(e.size)e.size*=f}}
  function modifyMirror(){const entities=selectedEntities();if(!entities.length){setStatus('Select objects first.');return}const axis=window.prompt('Mirror axis: horizontal or vertical','vertical')?.toLowerCase();if(!['horizontal','vertical'].includes(axis)){setStatus('Choose horizontal or vertical.');return}const c=selectionCenter(entities),mirror=p=>axis==='vertical'?{x:2*c.x-p.x,y:p.y}:{x:p.x,y:2*c.y-p.y};history.transact('MIRROR',()=>entities.forEach(e=>{if(e.type==='line'||e.type==='dimension'){e.a=mirror(e.a);e.b=mirror(e.b)}else if(e.type==='arc'){e.a=mirror(e.a);e.b=mirror(e.b);e.c=mirror(e.c)}else if(e.type==='rect'){const p=mirror({x:e.x+e.w/2,y:e.y+e.h/2});e.x=p.x-e.w/2;e.y=p.y-e.h/2;e.rotation=axis==='vertical'?-(e.rotation||0):180-(e.rotation||0)}else if(e.type==='circle'||e.type==='ellipse'){const p=mirror({x:e.cx,y:e.cy});e.cx=p.x;e.cy=p.y;if(e.type==='ellipse')e.rotation=axis==='vertical'?-(e.rotation||0):180-(e.rotation||0)}else if(['polyline','polygon','spline','revcloud'].includes(e.type))e.points=e.points.map(mirror);else if(e.type==='text'||e.type==='point'){const p=mirror({x:e.x,y:e.y});e.x=p.x;e.y=p.y}e.modifiedAt=new Date().toISOString()}));render()}
  function modifyArray(mode){
    const entities=selectedEntities();if(!entities.length){setStatus('Select objects first.');return}
    if(mode==='path'){
      const path=entities.find(e=>['polyline','line'].includes(e.type)),sources=entities.filter(e=>e!==path);
      if(!path||!sources.length){setStatus('Select source object(s) and a line/polyline path.');return}
      const pts=path.type==='line'?[path.a,path.b]:path.points,count=Number(window.prompt('Number of items along path (including original):','5'));
      if(!Number.isInteger(count)||count<2||count>500)return;
      const length=pts.slice(1).reduce((sum,p,i)=>sum+dist(pts[i],p),0),centers=sources.map(e=>{const b=worldBounds(e);return{x:(b.x1+b.x2)/2,y:(b.y1+b.y2)/2}});
      history.transact('ARRAY PATH',()=>{for(let n=1;n<count;n++){const at=pointAlongPath(pts,length*n/(count-1));sources.forEach((source,index)=>{const target=clone(source);target.id=uid();moveEntity(target,at.x-centers[index].x,at.y-centers[index].y);state.entities.push(target)})}});render();return
    }
    let cols=1,rows=1;
    if(mode==='rect'){const raw=window.prompt('Number of columns and rows (e.g. 3,2):','3,2');const m=String(raw||'').match(/^(\d+)\s*,\s*(\d+)$/);if(!m){setStatus('Enter columns,rows (for example 3,2).');return}cols=Number(m[1]);rows=Number(m[2])}
    else{cols=Number(window.prompt('Number of items including original:','6'));if(!Number.isInteger(cols)||cols<2||cols>500)return}
    if(!Number.isInteger(cols)||!Number.isInteger(rows)||cols<1||rows<1||cols*rows>500){setStatus('Array dimensions must be integers with no more than 500 items.');return}
    let sx=0,sy=0,c=selectionCenter(entities),radius=0,start=0;
    if(mode==='rect'){sx=Number(window.prompt('Column spacing (mm):','100'));sy=Number(window.prompt('Row spacing (mm):','100'));if(!Number.isFinite(sx)||!Number.isFinite(sy))return}
    else{radius=Number(window.prompt('Polar radius (mm):','100'));if(!Number.isFinite(radius)||radius<0)return;start=Number(window.prompt('Start angle (degrees):','0'));if(!Number.isFinite(start))return}
    history.transact(`ARRAY ${mode.toUpperCase()}`,()=>{for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){if(!row&&!col)continue;const index=row*cols+col,angle=start+360*index/(cols*rows);for(const source of entities){const target=clone(source);target.id=uid();if(mode==='rect')moveEntity(target,col*sx,row*sy);else{rotateEntity(target,c,angle);moveEntity(target,radius*Math.cos(angle*Math.PI/180),radius*Math.sin(angle*Math.PI/180))}state.entities.push(target)}}});render()
  }
  function pointAlongPath(points,distance){for(let i=1;i<points.length;i++){const length=dist(points[i-1],points[i]);if(distance<=length){const t=length?distance/length:0;return{x:points[i-1].x+(points[i].x-points[i-1].x)*t,y:points[i-1].y+(points[i].y-points[i-1].y)*t}}distance-=length}return points.at(-1)}
  function lineIntersection(a,b,c,d){const rx=b.x-a.x,ry=b.y-a.y,sx=d.x-c.x,sy=d.y-c.y,den=rx*sy-ry*sx;if(Math.abs(den)<1e-9)return null;const t=((c.x-a.x)*sy-(c.y-a.y)*sx)/den,u=((c.x-a.x)*ry-(c.y-a.y)*rx)/den;return {point:{x:a.x+t*rx,y:a.y+t*ry},t,u}}
  function modifyTrim(extend){const lines=selectedEntities().filter(e=>e.type==='line');if(lines.length<2){setStatus(`Select a target line and a ${extend?'boundary':'cutting'} line.`);return}const target=lines[0],cutters=lines.slice(1);let best=null;for(const cutter of cutters){const hit=lineIntersection(target.a,target.b,cutter.a,cutter.b);if(!hit||hit.u<0||hit.u>1)continue;if(!extend&&(hit.t<0||hit.t>1))continue;const end=dist(hit.point,target.a)<dist(hit.point,target.b)?'a':'b';if(!best||Math.abs(hit.t-(end==='a'?0:1))<best.score)best={...hit,end,score:Math.abs(hit.t-(end==='a'?0:1))}}if(!best){setStatus('Selected lines do not have a usable intersection.');return}history.transact(extend?'EXTEND':'TRIM',()=>{target[best.end]=best.point;target.modifiedAt=new Date().toISOString()});render();setStatus(`${extend?'Extended':'Trimmed'} ${target.id} to intersection.`)}
  function modifyFillet(){const lines=selectedEntities().filter(e=>e.type==='line');if(lines.length!==2){setStatus('Select exactly two intersecting lines.');return}const radius=Number(window.prompt('Fillet radius (mm):','25'));if(!Number.isFinite(radius)||radius<=0)return;const [a,b]=lines,hit=lineIntersection(a.a,a.b,b.a,b.b);if(!hit||hit.t<0||hit.t>1||hit.u<0||hit.u>1){setStatus('Fillet requires two intersecting line segments.');return}const v=hit.point,pa=dist(v,a.a)<dist(v,a.b)?a.a:a.b,pb=dist(v,b.a)<dist(v,b.b)?b.a:b.b,u={x:(pa.x-v.x)/dist(pa,v),y:(pa.y-v.y)/dist(pa,v)},w={x:(pb.x-v.x)/dist(pb,v),y:(pb.y-v.y)/dist(pb,v)},theta=Math.acos(clamp(u.x*w.x+u.y*w.y,-1,1));if(theta<1e-6||Math.abs(Math.PI-theta)<1e-6){setStatus('Fillet requires an angle between the selected lines.');return}const t=radius/Math.tan(theta/2);if(!Number.isFinite(t)||t>dist(pa,v)||t>dist(pb,v)){setStatus('Fillet radius does not fit the selected segments.');return}const p1={x:v.x+u.x*t,y:v.y+u.y*t},p2={x:v.x+w.x*t,y:v.y+w.y*t},bis={x:u.x+w.x,y:u.y+w.y},bl=Math.hypot(bis.x,bis.y),center={x:v.x+bis.x/bl*radius/Math.sin(theta/2),y:v.y+bis.y/bl*radius/Math.sin(theta/2)},u1={x:(p1.x-center.x)/radius,y:(p1.y-center.y)/radius},u2={x:(p2.x-center.x)/radius,y:(p2.y-center.y)/radius},sum={x:u1.x+u2.x,y:u1.y+u2.y},sl=Math.hypot(sum.x,sum.y),mid={x:center.x+sum.x/sl*radius,y:center.y+sum.y/sl*radius};history.transact('FILLET',()=>{if(dist(a.a,v)<dist(a.b,v))a.a=p1;else a.b=p1;if(dist(b.a,v)<dist(b.b,v))b.a=p2;else b.b=p2;state.entities.push({...clone(a),id:uid(),type:'arc',a:p1,b:mid,c:p2,layer:a.layer,createdAt:new Date().toISOString()})});render()}
  function modifyChamfer(){const lines=selectedEntities().filter(e=>e.type==='line');if(lines.length!==2){setStatus('Select exactly two intersecting lines.');return}const length=Number(window.prompt('Chamfer distance along each line (mm):','25'));if(!Number.isFinite(length)||length<=0)return;const [a,b]=lines,hit=lineIntersection(a.a,a.b,b.a,b.b);if(!hit||hit.t<0||hit.t>1||hit.u<0||hit.u>1){setStatus('Chamfer requires two intersecting line segments.');return}const v=hit.point,pa=dist(v,a.a)<dist(v,a.b)?a.a:a.b,pb=dist(v,b.a)<dist(v,b.b)?b.a:b.b;if(length>dist(pa,v)||length>dist(pb,v)){setStatus('Chamfer distance does not fit the selected segments.');return}const p1={x:v.x+(pa.x-v.x)*length/dist(pa,v),y:v.y+(pa.y-v.y)*length/dist(pa,v)},p2={x:v.x+(pb.x-v.x)*length/dist(pb,v),y:v.y+(pb.y-v.y)*length/dist(pb,v)};history.transact('CHAMFER',()=>{if(dist(a.a,v)<dist(a.b,v))a.a=p1;else a.b=p1;if(dist(b.a,v)<dist(b.b,v))b.a=p2;else b.b=p2;state.entities.push({type:'line',id:uid(),layer:a.layer,a:p1,b:p2})});render()}
  function modifyBreak(){const e=selectedEntity();if(!e||e.type!=='line'){setStatus('Select a line to break at the cursor.');return}const p=state.lastWorldPoint||e.a;if(dist(p,e.a)<1||dist(p,e.b)<1||pointSeg(p,e.a,e.b)>8/state.viewport.scale){setStatus('Place the cursor near the interior of the selected line, then run BREAK.');return}history.transact('BREAK',()=>{const other={...clone(e),id:uid(),a:{...p},createdAt:new Date().toISOString()};e.b={...p};state.entities.push(other)});render()}
  function modifyJoin(){const lines=selectedEntities().filter(e=>e.type==='line');if(lines.length<2){setStatus('Select two or more connected lines to join.');return}const points=[lines[0].a,lines[0].b];for(const line of lines.slice(1)){const tail=points.at(-1),head=points[0];if(dist(line.a,tail)<1)points.push(line.b);else if(dist(line.b,tail)<1)points.push(line.a);else if(dist(line.a,head)<1)points.unshift(line.b);else if(dist(line.b,head)<1)points.unshift(line.a);else{setStatus('Selected lines must connect end-to-end.');return}}history.transact('JOIN',()=>{state.entities=state.entities.filter(e=>!lines.includes(e));const now=new Date().toISOString();state.entities.push({id:uid(),type:'polyline',points,layer:lines[0].layer,layerId:lines[0].layerId,visible:true,locked:false,color:'BYLAYER',linetype:'BYLAYER',lineweight:null,transparency:0,attributes:{},metadata:{},transform:{x:0,y:0,z:0,rotation:0,scaleX:1,scaleY:1},createdAt:now,modifiedAt:now})});render()}
  function modifyExplode(){const entities=selectedEntities();if(!entities.length){setStatus('Select objects to explode.');return}history.transact('EXPLODE',()=>{for(const e of entities){let pieces=[];if(e.type==='rect'){const c={x:e.x+e.w/2,y:e.y+e.h/2};pieces=[[{x:e.x,y:e.y},{x:e.x+e.w,y:e.y}],[{x:e.x+e.w,y:e.y},{x:e.x+e.w,y:e.y+e.h}],[{x:e.x+e.w,y:e.y+e.h},{x:e.x,y:e.y+e.h}],[{x:e.x,y:e.y+e.h},{x:e.x,y:e.y}]].map(edge=>edge.map(p=>rotatedPoint(p,c,e.rotation||0))).map(([a,b])=>({a,b}))}else if(e.type==='polyline'||e.type==='polygon'||e.type==='spline')pieces=e.points.slice(1).map((p,i)=>({a:e.points[i],b:p}));else if(e.type==='ellipse'){pieces=Array.from({length:32},(_,i)=>{const a=i*Math.PI/16,b=(i+1)*Math.PI/16,c={x:e.cx,y:e.cy};return{a:rotatedPoint({x:e.cx+e.rx*Math.cos(a),y:e.cy+e.ry*Math.sin(a)},c,e.rotation||0),b:rotatedPoint({x:e.cx+e.rx*Math.cos(b),y:e.cy+e.ry*Math.sin(b)},c,e.rotation||0)}})}else if(e.type==='circle'){pieces=Array.from({length:32},(_,i)=>({a:{x:e.cx+e.r*Math.cos(i*Math.PI/16),y:e.cy+e.r*Math.sin(i*Math.PI/16)},b:{x:e.cx+e.r*Math.cos((i+1)*Math.PI/16),y:e.cy+e.r*Math.sin((i+1)*Math.PI/16)}}))}else if(e.type==='point'||e.type==='arc'||e.type==='revcloud'){setStatus(`Cannot explode ${e.type}.`);continue}else{setStatus(`Cannot explode ${e.type}.`);continue}state.entities=state.entities.filter(x=>x!==e);pieces.forEach(p=>state.entities.push({...clone(e),id:uid(),type:'line',...p,createdAt:new Date().toISOString()}))}});render()}
  function deleteSelection(){if(!state.selection.length){setStatus('Nothing selected.');return}const ids=new Set(state.selection),n=ids.size;history.transact('DELETE',()=>{state.entities=state.entities.filter(e=>!ids.has(e.id));state.selection=[]});render();setStatus(`${n} object${n>1?'s':''} deleted.`);log(`DELETE ${n} object(s)`)}

  svg.addEventListener('mousemove',ev=>{const raw=toWorld(ev.clientX,ev.clientY);const s=snapPoint(raw);state.lastWorldPoint=s.p;coordReadout.textContent=`X ${s.p.x.toFixed(3)}  Y ${s.p.y.toFixed(3)}`;crosshair.style.display='block';const r=wrap.getBoundingClientRect();crosshair.style.left=`${ev.clientX-r.left}px`;crosshair.style.top=`${ev.clientY-r.top}px`;snapBadge.style.display='block';snapBadge.style.left=`${ev.clientX-r.left+12}px`;snapBadge.style.top=`${ev.clientY-r.top+12}px`;snapBadge.textContent=s.kind;updateTool(s.p);if(state.interaction?.kind==='move'||state.interaction?.kind==='copy'){if(!state.interaction.start)return;state.interaction.current=s.p;renderPreview()}else if(state.interaction?.kind==='grip'){const i=state.interaction,e=state.entities.find(item=>item.id===i.entityId);if(e){updateGrip(e,i.key,s.p,i.original);render()}}});
  svg.addEventListener('mouseleave',()=>{crosshair.style.display='none';snapBadge.style.display='none'});
  svg.addEventListener('mousedown',ev=>{
    if(ev.button===1||(state.panKeyDown&&ev.button===0)||(ev.shiftKey&&state.tool==='select')){state.interaction={kind:'pan',sx:ev.clientX,sy:ev.clientY,vx:state.viewport.x,vy:state.viewport.y};state.pressStartedInteraction=false;wrap.classList.add('is-panning');ev.preventDefault();return}
    if(ev.button!==0)return;const grip=ev.target.closest?.('.cad-grip');if(grip){const e=state.entities.find(item=>item.id===grip.dataset.entityId);if(e&&!e.locked&&!layerByName(e.layer).locked)state.interaction={kind:'grip',entityId:e.id,key:grip.dataset.grip,original:clone(e),before:captureDocument()};ev.preventDefault();return}const p=snapPoint(toWorld(ev.clientX,ev.clientY)).p;
    if(state.interaction?.kind==='move'||state.interaction?.kind==='copy'){setStatus(state.interaction.start?'Pick destination point.':'Pick base point.');return}
    if(state.interaction&&state.interaction.kind===state.tool)return;
    const before=state.interaction;beginTool(p,ev.ctrlKey||ev.metaKey);state.pressStartedInteraction=Boolean(state.interaction&&state.interaction!==before&&state.tool!=='select')
  });
  svg.addEventListener('mouseup',ev=>{if(ev.button!==0&&ev.button!==1)return;if(state.pressStartedInteraction){state.pressStartedInteraction=false;return}if(!state.interaction)return;const i=state.interaction;if(i.kind==='pan'){state.interaction=null;wrap.classList.remove('is-panning');return}const p=snapPoint(toWorld(ev.clientX,ev.clientY)).p;if(i.kind==='select-box'){state.interaction=null;if(dist(i.start,p)<3/state.viewport.scale){const hit=hitTest(p);if(!i.additive)state.selection=[];if(hit){if(i.additive&&state.selection.includes(hit.id))state.selection=state.selection.filter(id=>id!==hit.id);else if(!state.selection.includes(hit.id))state.selection.push(hit.id)}render();setStatus(hit?`${hit.type} ${hit.id} selected`:'No object selected.')}else selectInBox(i.start,p,i.additive);return}if(i.kind==='grip'){history.record(`GRIP ${i.entityId}`,i.before);state.interaction=null;render();return}if(i.kind==='move'||i.kind==='copy'){if(!i.start){i.start=p;setStatus('Pick destination point.');return}const dx=p.x-i.start.x,dy=p.y-i.start.y,before=captureDocument(),sources=i.entityIds.map(id=>state.entities.find(x=>x.id===id)).filter(Boolean);if(sources.length){const targets=sources.map(e=>{if(i.kind==='move')return e;const copy=clone(e);copy.id=uid();copy.createdAt=new Date().toISOString();state.entities.push(copy);return copy});targets.forEach(target=>{moveEntity(target,dx,dy);target.modifiedAt=new Date().toISOString()});if(i.kind==='copy')state.selection=targets.map(e=>e.id);history.record(i.kind.toUpperCase(),before);render();log(`${i.kind.toUpperCase()} ${sources.length} object(s)`)}state.interaction=null;setTool('select');return}endTool(p)});
  window.addEventListener('mousemove',ev=>{if(state.interaction?.kind==='pan'){state.viewport.x=state.interaction.vx+(ev.clientX-state.interaction.sx);state.viewport.y=state.interaction.vy+(ev.clientY-state.interaction.sy);applyViewport()}});
  // Finish pan even if the mouse is released outside the drawing canvas.
  window.addEventListener('mouseup',()=>{if(state.interaction?.kind==='pan'){state.interaction=null;wrap.classList.remove('is-panning')}});
  window.addEventListener('blur',()=>{state.panKeyDown=false;wrap.classList.remove('pan-ready');if(state.interaction?.kind==='pan'){state.interaction=null;wrap.classList.remove('is-panning')}});
  function moveEntity(e,dx,dy){const move=p=>{p.x+=dx;p.y+=dy};if(e.type==='line'||e.type==='dimension'){move(e.a);move(e.b)}else if(e.type==='arc'){move(e.a);move(e.b);move(e.c)}else if(e.type==='rect'){e.x+=dx;e.y+=dy}else if(e.type==='circle'||e.type==='ellipse'){e.cx+=dx;e.cy+=dy}else if(['polyline','polygon','spline','revcloud'].includes(e.type))e.points.forEach(move);else if(e.type==='text'||e.type==='point'){e.x+=dx;e.y+=dy}}
  svg.addEventListener('dblclick',ev=>{const p=snapPoint(toWorld(ev.clientX,ev.clientY)).p;const h=hitTest(p);if(h&&h.type==='text'){const v=window.prompt('Edit text:',h.text);if(v!==null){h.text=v;render();}}});
  svg.addEventListener('wheel',ev=>{
    // Covers wheel mice, smooth trackpads, and Ctrl+wheel trackpad-pinch
    // gestures. Zoom is anchored to the pointer rather than the canvas origin.
    ev.preventDefault();
    const rect=svg.getBoundingClientRect();
    const viewBox=svg.viewBox.baseVal;
    const screenPoint={
      x:(ev.clientX-rect.left)*(viewBox.width/Math.max(1,rect.width)),
      y:(ev.clientY-rect.top)*(viewBox.height/Math.max(1,rect.height))
    };
    const deltaScale=ev.deltaMode===1?16:ev.deltaMode===2?wrap.clientHeight:1;
    const deltaY=ev.deltaY*deltaScale;
    const sensitivity=ev.ctrlKey?0.0035:0.0015;
    const factor=Math.exp(clamp(-deltaY*sensitivity,-1.5,1.5));
    Object.assign(state.viewport,Core.zoomViewportAt(state.viewport,screenPoint,factor));
    applyViewport();
  }, {passive:false});
  document.addEventListener('keydown',ev=>{
    const target=ev.target;
    const editingTarget=Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"]'));
    if(ev.code==='Space'&&!editingTarget){ev.preventDefault();state.panKeyDown=true;wrap.classList.add('pan-ready');return}
    if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='z'){ev.preventDefault();command(ev.shiftKey?'REDO':'UNDO');return}
    if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='y'){ev.preventDefault();command('REDO');return}
    if(document.activeElement===commandInput){
      if(ev.key==='Enter'){
        const input=commandInput.value.trim();commandInput.value='';
        const kinds=['line','rect','circle','dimension','arc','ellipse','polygon','polyline','spline','revcloud'];
        if(state.interaction&&kinds.includes(state.interaction.kind)){
          if(!input&&['polyline','spline','revcloud'].includes(state.interaction.kind))finishPolyline();
          else{const ref=state.interaction.start||state.interaction.points?.at(-1)||{x:0,y:0},point=state.dynamicInput?Core.parseCoordinate(input,ref):null;if(point)endTool(point,true);else if(input)command(input)}
        }else{const point=state.dynamicInput?Core.parseCoordinate(input):null;if(point&&kinds.includes(state.tool))beginTool(point,false,true);else command(input)}
        ev.preventDefault()
      }
      return
    }
    if(ev.key==='Escape'){if(state.interaction?.kind==='grip')restoreDocument(state.interaction.before);state.interaction=null;wrap.classList.remove('is-panning');state.selection=[];setTool('select');render();setStatus('Cancelled.');return}
    if(ev.key==='Enter'&&['polyline','spline','revcloud'].includes(state.interaction?.kind)){finishPolyline();return}
    if((ev.key==='Delete'||ev.key==='Backspace')&&state.selection.length){deleteSelection();return}
    if(ev.key==='F3'){state.snap=!state.snap;document.getElementById('snapState').textContent=state.snap?'SNAP ON':'SNAP OFF';document.getElementById('snapToggle').classList.toggle('active',state.snap);return}
    if(ev.key==='F8'){state.ortho=!state.ortho;document.getElementById('orthoToggle').classList.toggle('active',state.ortho);return}
    if(ev.key==='F10'){state.polar=!state.polar;document.getElementById('polarToggle').classList.toggle('active',state.polar);return}
    if(ev.key==='F11'){state.tracking=!state.tracking;document.getElementById('trackingToggle').classList.toggle('active',state.tracking);return}
    const k=ev.key.toUpperCase();if(k==='L')setTool('line');else if(k==='C')setTool('circle');else if(k==='V')setTool('select');else if(k==='T')setTool('text');else if(k==='D')setTool('dimension');else if(k==='M')modifyMove();else if(k==='O')modifyOffset();else if(k==='R')modifyRotate();else if(k==='P')setTool('polyline');
  });
  window.addEventListener('keyup',ev=>{if(ev.code==='Space'){state.panKeyDown=false;wrap.classList.remove('pan-ready')}});
  document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
  document.querySelectorAll('[data-command]').forEach(b=>b.addEventListener('click',()=>{const c=b.dataset.command;if(c==='new')newDrawing();else if(c==='open')fileInput.click();else if(c==='save')saveBahl();else if(c==='svg')exportSvg();else if(c==='dxf')exportDxf();else command(c)}));
  document.getElementById('snapToggle').addEventListener('click',()=>{state.snap=!state.snap;document.getElementById('snapState').textContent=state.snap?'SNAP ON':'SNAP OFF';document.getElementById('snapToggle').classList.toggle('active',state.snap)});
  document.getElementById('orthoToggle').addEventListener('click',()=>{state.ortho=!state.ortho;document.getElementById('orthoToggle').classList.toggle('active',state.ortho);setStatus(`Ortho ${state.ortho?'on':'off'}.`)});
  document.getElementById('polarToggle').addEventListener('click',()=>{state.polar=!state.polar;document.getElementById('polarToggle').classList.toggle('active',state.polar);setStatus(`Polar tracking ${state.polar?'on':'off'} (15° increments).`)});
  document.getElementById('trackingToggle').addEventListener('click',()=>{state.tracking=!state.tracking;document.getElementById('trackingToggle').classList.toggle('active',state.tracking);setStatus(`Object snap tracking ${state.tracking?'on':'off'}.`)});
  document.getElementById('dynamicToggle').addEventListener('click',()=>{state.dynamicInput=!state.dynamicInput;document.getElementById('dynamicToggle').classList.toggle('active',state.dynamicInput);setStatus(`Dynamic coordinate input ${state.dynamicInput?'on':'off'}.`)});
  document.getElementById('addConstraint').addEventListener('click',addConstraint);
  document.getElementById('addParameter').addEventListener('click',addParameter);
  document.getElementById('gridToggle').addEventListener('click',()=>{state.grid=!state.grid;render()});
  document.getElementById('fitView').addEventListener('click',fitView);
  document.getElementById('addLayer').addEventListener('click',()=>{const n=window.prompt('New layer name:','Layer '+(state.layers.length+1));if(!n)return;if(state.layers.some(l=>l.name===n)){setStatus('Layer already exists.');return}history.transact('CREATE LAYER',()=>{state.layers.push({id:`layer-${Date.now()}`,name:n,visible:true,locked:false,color:'#'+Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0')});state.activeLayer=n});render();log(`Layer created: ${n}`)});
  fileInput.addEventListener('change',async()=>{const f=fileInput.files?.[0];if(!f)return;try{const data=JSON.parse(await f.text()),migrated=Core.normalizeDocument(data),doc=migrated.document;Object.assign(state,{units:doc.units,layers:doc.layers,activeLayer:doc.activeLayer,entities:doc.entities,nextId:doc.nextId,constraints:doc.constraints,parameters:doc.parameters,grid:migrated.view.grid,snap:migrated.view.snap,ortho:migrated.view.ortho,polar:migrated.view.polar,tracking:migrated.view.tracking,dynamicInput:migrated.view.dynamicInput,gridSize:migrated.view.gridSize,majorGrid:migrated.view.majorGrid,viewport:migrated.view.viewport,selection:[],interaction:null});history.clear();render();log(`Opened ${f.name}${data.version?'':' (legacy format migrated)'}`)}catch(e){alert(`Could not open that Bahl CAD file: ${e.message}`)}});
  function newDrawing(){if(!confirm('Start a new drawing? Unsaved work will be lost.'))return;state.entities=[];state.constraints=[];state.parameters=[];state.selection=[];state.nextId=1;state.viewport={x:0,y:0,scale:1};history.clear();render();setStatus('New drawing.');log('NEW drawing')}
  function saveBahl(){download('bahl-drawing.bahl',JSON.stringify(Core.serializeDocument(state),null,2),'application/json');log('SAVED .BAHL drawing')}
  function download(name,content,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
  function exportSvg(){const copy=svg.cloneNode(true);copy.querySelector('#cursorOverlay')?.remove();copy.querySelector('#grid')?.remove();copy.setAttribute('xmlns',NS);copy.setAttribute('viewBox',`0 0 ${wrap.clientWidth} ${wrap.clientHeight}`);copy.querySelector('#drawingRoot')?.setAttribute('transform',`translate(${state.viewport.x} ${state.viewport.y}) scale(${state.viewport.scale})`);download('bahl-drawing.svg',new XMLSerializer().serializeToString(copy),'image/svg+xml');log('EXPORTED SVG')}
  function dxf(){let out=['0','SECTION','2','ENTITIES'];for(const e of state.entities){if(e.type==='line'){out.push('0','LINE','8',e.layer,'10',e.a.x,'20',e.a.y,'11',e.b.x,'21',e.b.y)}else if(e.type==='circle'){out.push('0','CIRCLE','8',e.layer,'10',e.cx,'20',e.cy,'40',e.r)}else if(e.type==='polyline'){out.push('0','LWPOLYLINE','8',e.layer,'90',e.points.length);for(const p of e.points)out.push('10',p.x,'20',p.y)}else if(e.type==='text'){out.push('0','TEXT','8',e.layer,'10',e.x,'20',e.y,'40',e.size||20,'1',e.text||'')}}out.push('0','ENDSEC','0','EOF');return out.join('\n')+'\n'}
  function exportDxf(){download('bahl-drawing.dxf',dxf(),'application/dxf');log('EXPORTED DXF')}
  function fitView(){if(!state.entities.length){state.viewport={x:40,y:40,scale:1};applyViewport();return}const bs=state.entities.map(worldBounds);const b={x1:Math.min(...bs.map(x=>x.x1)),y1:Math.min(...bs.map(x=>x.y1)),x2:Math.max(...bs.map(x=>x.x2)),y2:Math.max(...bs.map(x=>x.y2))};const pad=80,w=Math.max(1,b.x2-b.x1),h=Math.max(1,b.y2-b.y1);state.viewport.scale=Math.min((wrap.clientWidth-pad*2)/w,(wrap.clientHeight-pad*2)/h);state.viewport.x=wrap.clientWidth/2-(b.x1+b.x2)/2*state.viewport.scale;state.viewport.y=wrap.clientHeight/2-(b.y1+b.y2)/2*state.viewport.scale;applyViewport();log('ZOOM EXTENTS')}

  // starter structural example: 4-column bay, one beam and two dimensions
  function seedExample(){
    const S='Structural',D='Dimensions';
    state.entities.push({id:uid(),type:'line',layer:S,a:{x:250,y:250},b:{x:750,y:250}});
    state.entities.push({id:uid(),type:'line',layer:S,a:{x:250,y:500},b:{x:750,y:500}});
    state.entities.push({id:uid(),type:'line',layer:S,a:{x:250,y:250},b:{x:250,y:500}});
    state.entities.push({id:uid(),type:'line',layer:S,a:{x:750,y:250},b:{x:750,y:500}});
    for(const [x,y] of [[250,250],[750,250],[250,500],[750,500]])state.entities.push({id:uid(),type:'rect',layer:S,x:x-25,y:y-25,w:50,h:50});
    state.entities.push({id:uid(),type:'dimension',layer:D,a:{x:250,y:250},b:{x:750,y:250},offset:-80});
    state.entities.push({id:uid(),type:'dimension',layer:D,a:{x:250,y:250},b:{x:250,y:500},offset:-80});
    state.entities.push({id:uid(),type:'text',layer:'Text',x:380,y:380,text:'STRUCTURAL PLAN — MVP',size:24});
  }
  seedExample();const initial=Core.normalizeDocument(captureDocument()).document;Object.assign(state,{layers:initial.layers,activeLayer:initial.activeLayer,entities:initial.entities,nextId:initial.nextId});registerCommands();setTool('select');render();fitView();setStatus('Bahl CAD MVP ready.');log('READY — structural drafting core loaded');
})();
