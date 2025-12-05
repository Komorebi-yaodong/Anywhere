import{p as y}from"./chunk-353BL4L5-Dn_Y_Yna-6wDbUalg.js";import{_ as c,s as B,g as S,t as z,q as F,a as P,b as E,F as m,K as W,e as T,z as D,G as _,H as A,l as w}from"./mermaid.core-CAqkCmS1-BMpfbGMw.js";import{p as N}from"./treemap-75Q7IDZK-B2atdfMH-BavrUItu.js";import"./index-HrcDXYj4.js";import"./_baseUniq-BXtq6_NW-Cq1F8lEj.js";import"./min-BngCxx8g-B--td1sZ.js";import"./clone-CEJtuQzg-BIfUyywD.js";var x={packet:[]},v=structuredClone(x),L=A.packet,Y=c(()=>{const t=m({...L,..._().packet});return t.showBits&&(t.paddingY+=10),t},"getConfig"),G=c(()=>v.packet,"getPacket"),H=c(t=>{t.length>0&&v.packet.push(t)},"pushWord"),I=c(()=>{D(),v=structuredClone(x)},"clear"),u={pushWord:H,getPacket:G,getConfig:Y,clear:I,setAccTitle:E,getAccTitle:P,setDiagramTitle:F,getDiagramTitle:z,getAccDescription:S,setAccDescription:B},K=1e4,M=c(t=>{y(t,u);let e=-1,o=[],s=1;const{bitsPerRow:n}=u.getConfig();for(let{start:a,end:r,bits:l,label:f}of t.blocks){if(a!==void 0&&r!==void 0&&r<a)throw new Error(`Packet block ${a} - ${r} is invalid. End must be greater than start.`);if(a??(a=e+1),a!==e+1)throw new Error(`Packet block ${a} - ${r??a} is not contiguous. It should start from ${e+1}.`);if(l===0)throw new Error(`Packet block ${a} is invalid. Cannot have a zero bit field.`);for(r??(r=a+(l??1)-1),l??(l=r-a+1),e=r,w.debug(`Packet block ${a} - ${e} with label ${f}`);o.length<=n+1&&u.getPacket().length<K;){const[d,p]=O({start:a,end:r,bits:l,label:f},s,n);if(o.push(d),d.end+1===s*n&&(u.pushWord(o),o=[],s++),!p)break;({start:a,end:r,bits:l,label:f}=p)}}u.pushWord(o)},"populate"),O=c((t,e,o)=>{if(t.start===void 0)throw new Error("start should have been set during first phase");if(t.end===void 0)throw new Error("end should have been set during first phase");if(t.start>t.end)throw new Error(`Block start ${t.start} is greater than block end ${t.end}.`);if(t.end+1<=e*o)return[t,void 0];const s=e*o-1,n=e*o;return[{start:t.start,end:s,label:t.label,bits:s-t.start},{start:n,end:t.end,label:t.label,bits:t.end-n}]},"getNextFittingBlock"),q={parse:c(async t=>{const e=await N("packet",t);w.debug(e),M(e)},"parse")},R=c((t,e,o,s)=>{const n=s.db,a=n.getConfig(),{rowHeight:r,paddingY:l,bitWidth:f,bitsPerRow:d}=a,p=n.getPacket(),i=n.getDiagramTitle(),k=r+l,g=k*(p.length+1)-(i?0:r),b=f*d+2,h=W(e);h.attr("viewbox",`0 0 ${b} ${g}`),T(h,g,b,a.useMaxWidth);for(const[C,$]of p.entries())U(h,$,C,a);h.append("text").text(i).attr("x",b/2).attr("y",g-k/2).attr("dominant-baseline","middle").attr("text-anchor","middle").attr("class","packetTitle")},"draw"),U=c((t,e,o,{rowHeight:s,paddingX:n,paddingY:a,bitWidth:r,bitsPerRow:l,showBits:f})=>{const d=t.append("g"),p=o*(s+a)+a;for(const i of e){const k=i.start%l*r+1,g=(i.end-i.start+1)*r-n;if(d.append("rect").attr("x",k).attr("y",p).attr("width",g).attr("height",s).attr("class","packetBlock"),d.append("text").attr("x",k+g/2).attr("y",p+s/2).attr("class","packetLabel").attr("dominant-baseline","middle").attr("text-anchor","middle").text(i.label),!f)continue;const b=i.end===i.start,h=p-2;d.append("text").attr("x",k+(b?g/2:0)).attr("y",h).attr("class","packetByte start").attr("dominant-baseline","auto").attr("text-anchor",b?"middle":"start").text(i.start),b||d.append("text").attr("x",k+g).attr("y",h).attr("class","packetByte end").attr("dominant-baseline","auto").attr("text-anchor","end").text(i.end)}},"drawWord"),X={draw:R},j={byteFontSize:"10px",startByteColor:"black",endByteColor:"black",labelColor:"black",labelFontSize:"12px",titleColor:"black",titleFontSize:"14px",blockStrokeColor:"black",blockStrokeWidth:"1",blockFillColor:"#efefef"},J=c(({packet:t}={})=>{const e=m(j,t);return`
	.packetByte {
		font-size: ${e.byteFontSize};
	}
	.packetByte.start {
		fill: ${e.startByteColor};
	}
	.packetByte.end {
		fill: ${e.endByteColor};
	}
	.packetLabel {
		fill: ${e.labelColor};
		font-size: ${e.labelFontSize};
	}
	.packetTitle {
		fill: ${e.titleColor};
		font-size: ${e.titleFontSize};
	}
	.packetBlock {
		stroke: ${e.blockStrokeColor};
		stroke-width: ${e.blockStrokeWidth};
		fill: ${e.blockFillColor};
	}
	`},"styles"),ot={parser:q,db:u,renderer:X,styles:J};export{ot as diagram};
