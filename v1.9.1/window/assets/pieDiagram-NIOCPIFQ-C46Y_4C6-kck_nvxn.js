import{p as V}from"./chunk-353BL4L5-Dn_Y_Yna-5xUXMtQv.js";import{_ as u,g as U,s as j,a as q,b as H,t as K,q as Q,l as F,c as Z,F as J,K as X,a4 as Y,e as tt,z as et,H as at,Q as y,aE as rt,T as z}from"./mermaid.core-CAqkCmS1-BN2glEBF.js";import{p as nt}from"./treemap-75Q7IDZK-B2atdfMH-9pVz_iLD.js";import{d as P}from"./arc-Js_tyW10-gkUMjfwI.js";import{o as it}from"./ordinal-DSZU4PqD-DOFoVEQk.js";import"./index-MzPzDtn7.js";import"./_baseUniq-BXtq6_NW-DxHrspfr.js";import"./min-BngCxx8g-DuKIAEi0.js";import"./clone-CEJtuQzg-BqyhdiNv.js";import"./init-ZxktEp_H-Gi6I4Gst.js";function st(t,a){return a<t?-1:a>t?1:a>=t?0:NaN}function ot(t){return t}function lt(){var t=ot,a=st,h=null,o=y(0),p=y(z),x=y(0);function i(e){var r,l=(e=rt(e)).length,d,A,v=0,c=new Array(l),n=new Array(l),f=+o.apply(this,arguments),w=Math.min(z,Math.max(-z,p.apply(this,arguments)-f)),m,T=Math.min(Math.abs(w)/l,x.apply(this,arguments)),$=T*(w<0?-1:1),g;for(r=0;r<l;++r)(g=n[c[r]=r]=+t(e[r],r,e))>0&&(v+=g);for(a!=null?c.sort(function(S,C){return a(n[S],n[C])}):h!=null&&c.sort(function(S,C){return h(e[S],e[C])}),r=0,A=v?(w-l*$)/v:0;r<l;++r,f=m)d=c[r],g=n[d],m=f+(g>0?g*A:0)+$,n[d]={data:e[d],index:r,value:g,startAngle:f,endAngle:m,padAngle:T};return n}return i.value=function(e){return arguments.length?(t=typeof e=="function"?e:y(+e),i):t},i.sortValues=function(e){return arguments.length?(a=e,h=null,i):a},i.sort=function(e){return arguments.length?(h=e,a=null,i):h},i.startAngle=function(e){return arguments.length?(o=typeof e=="function"?e:y(+e),i):o},i.endAngle=function(e){return arguments.length?(p=typeof e=="function"?e:y(+e),i):p},i.padAngle=function(e){return arguments.length?(x=typeof e=="function"?e:y(+e),i):x},i}var ct=at.pie,G={sections:new Map,showData:!1},b=G.sections,W=G.showData,ut=structuredClone(ct),pt=u(()=>structuredClone(ut),"getConfig"),dt=u(()=>{b=new Map,W=G.showData,et()},"clear"),gt=u(({label:t,value:a})=>{b.has(t)||(b.set(t,a),F.debug(`added new section: ${t}, with value: ${a}`))},"addSection"),ft=u(()=>b,"getSections"),mt=u(t=>{W=t},"setShowData"),ht=u(()=>W,"getShowData"),R={getConfig:pt,clear:dt,setDiagramTitle:Q,getDiagramTitle:K,setAccTitle:H,getAccTitle:q,setAccDescription:j,getAccDescription:U,addSection:gt,getSections:ft,setShowData:mt,getShowData:ht},vt=u((t,a)=>{V(t,a),a.setShowData(t.showData),t.sections.map(a.addSection)},"populateDb"),St={parse:u(async t=>{const a=await nt("pie",t);F.debug(a),vt(a,R)},"parse")},yt=u(t=>`
  .pieCircle{
    stroke: ${t.pieStrokeColor};
    stroke-width : ${t.pieStrokeWidth};
    opacity : ${t.pieOpacity};
  }
  .pieOuterCircle{
    stroke: ${t.pieOuterStrokeColor};
    stroke-width: ${t.pieOuterStrokeWidth};
    fill: none;
  }
  .pieTitleText {
    text-anchor: middle;
    font-size: ${t.pieTitleTextSize};
    fill: ${t.pieTitleTextColor};
    font-family: ${t.fontFamily};
  }
  .slice {
    font-family: ${t.fontFamily};
    fill: ${t.pieSectionTextColor};
    font-size:${t.pieSectionTextSize};
    // fill: white;
  }
  .legend text {
    fill: ${t.pieLegendTextColor};
    font-family: ${t.fontFamily};
    font-size: ${t.pieLegendTextSize};
  }
`,"getStyles"),xt=yt,At=u(t=>{const a=[...t.entries()].map(o=>({label:o[0],value:o[1]})).sort((o,p)=>p.value-o.value);return lt().value(o=>o.value)(a)},"createPieArcs"),wt=u((t,a,h,o)=>{F.debug(`rendering pie chart
`+t);const p=o.db,x=Z(),i=J(p.getConfig(),x.pie),e=40,r=18,l=4,d=450,A=d,v=X(a),c=v.append("g");c.attr("transform","translate("+A/2+","+d/2+")");const{themeVariables:n}=x;let[f]=Y(n.pieOuterStrokeWidth);f??(f=2);const w=i.textPosition,m=Math.min(A,d)/2-e,T=P().innerRadius(0).outerRadius(m),$=P().innerRadius(m*w).outerRadius(m*w);c.append("circle").attr("cx",0).attr("cy",0).attr("r",m+f/2).attr("class","pieOuterCircle");const g=p.getSections(),S=At(g),C=[n.pie1,n.pie2,n.pie3,n.pie4,n.pie5,n.pie6,n.pie7,n.pie8,n.pie9,n.pie10,n.pie11,n.pie12],D=it(C);c.selectAll("mySlices").data(S).enter().append("path").attr("d",T).attr("fill",s=>D(s.data.label)).attr("class","pieCircle");let N=0;g.forEach(s=>{N+=s}),c.selectAll("mySlices").data(S).enter().append("text").text(s=>(s.data.value/N*100).toFixed(0)+"%").attr("transform",s=>"translate("+$.centroid(s)+")").style("text-anchor","middle").attr("class","slice"),c.append("text").text(p.getDiagramTitle()).attr("x",0).attr("y",-400/2).attr("class","pieTitleText");const M=c.selectAll(".legend").data(D.domain()).enter().append("g").attr("class","legend").attr("transform",(s,E)=>{const k=r+l,L=k*D.domain().length/2,_=12*r,B=E*k-L;return"translate("+_+","+B+")"});M.append("rect").attr("width",r).attr("height",r).style("fill",D).style("stroke",D),M.data(S).append("text").attr("x",r+l).attr("y",r-l).text(s=>{const{label:E,value:k}=s.data;return p.getShowData()?`${E} [${k}]`:E});const I=Math.max(...M.selectAll("text").nodes().map(s=>(s==null?void 0:s.getBoundingClientRect().width)??0)),O=A+e+r+l+I;v.attr("viewBox",`0 0 ${O} ${d}`),tt(v,d,O,i.useMaxWidth)},"draw"),Ct={draw:wt},Wt={parser:St,db:R,renderer:Ct,styles:xt};export{Wt as diagram};
