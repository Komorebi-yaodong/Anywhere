import{_ as b,F as m,K as B,e as C,l as v,b as S,a as D,q as T,t as z,g as F,s as P,G as E,H as A,z as _}from"./mermaid.core-B0WXDFZp-DJZ1xyTe.js";import{p as W}from"./chunk-4BX2VUAB-AWtG75oi-B86fcEcW.js";import{p as N}from"./treemap-75Q7IDZK-BVE2z8EB-DCguxqXi.js";import"./index-BexXKemG.js";import"./ChatMessage-DuaI-6mW.js";import"./_baseUniq-CuM2RS0h-Dpzz5tsO.js";import"./min-cDCw1MM3-DcWgPXjz.js";import"./clone-CYku6Kza-CLB1Yr-8.js";var u,L=A.packet,w=(u=class{constructor(){this.packet=[],this.setAccTitle=S,this.getAccTitle=D,this.setDiagramTitle=T,this.getDiagramTitle=z,this.getAccDescription=F,this.setAccDescription=P}getConfig(){const t=m({...L,...E().packet});return t.showBits&&(t.paddingY+=10),t}getPacket(){return this.packet}pushWord(t){t.length>0&&this.packet.push(t)}clear(){_(),this.packet=[]}},b(u,"PacketDB"),u),M=1e4,Y=b((t,e)=>{W(t,e);let o=-1,r=[],n=1;const{bitsPerRow:l}=e.getConfig();for(let{start:a,end:s,bits:c,label:d}of t.blocks){if(a!==void 0&&s!==void 0&&s<a)throw new Error(`Packet block ${a} - ${s} is invalid. End must be greater than start.`);if(a??(a=o+1),a!==o+1)throw new Error(`Packet block ${a} - ${s??a} is not contiguous. It should start from ${o+1}.`);if(c===0)throw new Error(`Packet block ${a} is invalid. Cannot have a zero bit field.`);for(s??(s=a+(c??1)-1),c??(c=s-a+1),o=s,v.debug(`Packet block ${a} - ${o} with label ${d}`);r.length<=l+1&&e.getPacket().length<M;){const[p,i]=G({start:a,end:s,bits:c,label:d},n,l);if(r.push(p),p.end+1===n*l&&(e.pushWord(r),r=[],n++),!i)break;({start:a,end:s,bits:c,label:d}=i)}}e.pushWord(r)},"populate"),G=b((t,e,o)=>{if(t.start===void 0)throw new Error("start should have been set during first phase");if(t.end===void 0)throw new Error("end should have been set during first phase");if(t.start>t.end)throw new Error(`Block start ${t.start} is greater than block end ${t.end}.`);if(t.end+1<=e*o)return[t,void 0];const r=e*o-1,n=e*o;return[{start:t.start,end:r,label:t.label,bits:r-t.start},{start:n,end:t.end,label:t.label,bits:t.end-n}]},"getNextFittingBlock"),x={parser:{yy:void 0},parse:b(async t=>{var e;const o=await N("packet",t),r=(e=x.parser)==null?void 0:e.yy;if(!(r instanceof w))throw new Error("parser.parser?.yy was not a PacketDB. This is due to a bug within Mermaid, please report this issue at https://github.com/mermaid-js/mermaid/issues.");v.debug(o),Y(o,r)},"parse")},H=b((t,e,o,r)=>{const n=r.db,l=n.getConfig(),{rowHeight:a,paddingY:s,bitWidth:c,bitsPerRow:d}=l,p=n.getPacket(),i=n.getDiagramTitle(),h=a+s,g=h*(p.length+1)-(i?0:a),k=c*d+2,f=B(e);f.attr("viewbox",`0 0 ${k} ${g}`),C(f,g,k,l.useMaxWidth);for(const[y,$]of p.entries())I(f,$,y,l);f.append("text").text(i).attr("x",k/2).attr("y",g-h/2).attr("dominant-baseline","middle").attr("text-anchor","middle").attr("class","packetTitle")},"draw"),I=b((t,e,o,{rowHeight:r,paddingX:n,paddingY:l,bitWidth:a,bitsPerRow:s,showBits:c})=>{const d=t.append("g"),p=o*(r+l)+l;for(const i of e){const h=i.start%s*a+1,g=(i.end-i.start+1)*a-n;if(d.append("rect").attr("x",h).attr("y",p).attr("width",g).attr("height",r).attr("class","packetBlock"),d.append("text").attr("x",h+g/2).attr("y",p+r/2).attr("class","packetLabel").attr("dominant-baseline","middle").attr("text-anchor","middle").text(i.label),!c)continue;const k=i.end===i.start,f=p-2;d.append("text").attr("x",h+(k?g/2:0)).attr("y",f).attr("class","packetByte start").attr("dominant-baseline","auto").attr("text-anchor",k?"middle":"start").text(i.start),k||d.append("text").attr("x",h+g).attr("y",f).attr("class","packetByte end").attr("dominant-baseline","auto").attr("text-anchor","end").text(i.end)}},"drawWord"),K={draw:H},O={byteFontSize:"10px",startByteColor:"black",endByteColor:"black",labelColor:"black",labelFontSize:"12px",titleColor:"black",titleFontSize:"14px",blockStrokeColor:"black",blockStrokeWidth:"1",blockFillColor:"#efefef"},j=b(({packet:t}={})=>{const e=m(O,t);return`
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
	`},"styles"),tt={parser:x,get db(){return new w},renderer:K,styles:j};export{tt as diagram};
