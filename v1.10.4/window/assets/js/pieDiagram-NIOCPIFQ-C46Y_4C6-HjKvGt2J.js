import{p as V}from"./chunk-353BL4L5-Dn_Y_Yna-CPIpEa4K.js";import{_ as p,g as U,s as j,a as q,b as H,t as K,q as Q,l as F,c as Z,F as J,K as X,a4 as Y,e as tt,z as et,H as at,Q as y,aE as rt,T as z}from"./mermaid.core-CAqkCmS1-DiB_TwNT.js";import{p as nt}from"./treemap-75Q7IDZK-B2atdfMH-BJhXckTA.js";import{d as P}from"./arc-Js_tyW10-Dx0XaL8n.js";import{o as it}from"./ordinal-DSZU4PqD-DOFoVEQk.js";import"./mermaid-PPVm8Dsz.js";import"./ChatMessage-BCLm1IRb.js";import"./element-plus-BXislPqv.js";import"./vendor-utils-Biw9DGem.js";import"./index-Bb6haicQ.js";import"./_baseUniq-BXtq6_NW-f-3dbVc5.js";import"./min-BngCxx8g-Bn2T0cMu.js";import"./clone-CEJtuQzg-CIahMY_f.js";import"./init-ZxktEp_H-Gi6I4Gst.js";function ot(t,a){return a<t?-1:a>t?1:a>=t?0:NaN}function st(t){return t}function lt(){var t=st,a=ot,h=null,s=y(0),u=y(z),x=y(0);function i(e){var r,l=(e=rt(e)).length,d,A,v=0,c=new Array(l),n=new Array(l),f=+s.apply(this,arguments),w=Math.min(z,Math.max(-z,u.apply(this,arguments)-f)),m,T=Math.min(Math.abs(w)/l,x.apply(this,arguments)),$=T*(w<0?-1:1),g;for(r=0;r<l;++r)(g=n[c[r]=r]=+t(e[r],r,e))>0&&(v+=g);for(a!=null?c.sort(function(S,C){return a(n[S],n[C])}):h!=null&&c.sort(function(S,C){return h(e[S],e[C])}),r=0,A=v?(w-l*$)/v:0;r<l;++r,f=m)d=c[r],g=n[d],m=f+(g>0?g*A:0)+$,n[d]={data:e[d],index:r,value:g,startAngle:f,endAngle:m,padAngle:T};return n}return i.value=function(e){return arguments.length?(t=typeof e=="function"?e:y(+e),i):t},i.sortValues=function(e){return arguments.length?(a=e,h=null,i):a},i.sort=function(e){return arguments.length?(h=e,a=null,i):h},i.startAngle=function(e){return arguments.length?(s=typeof e=="function"?e:y(+e),i):s},i.endAngle=function(e){return arguments.length?(u=typeof e=="function"?e:y(+e),i):u},i.padAngle=function(e){return arguments.length?(x=typeof e=="function"?e:y(+e),i):x},i}var ct=at.pie,G={sections:new Map,showData:!1},b=G.sections,W=G.showData,pt=structuredClone(ct),ut=p(()=>structuredClone(pt),"getConfig"),dt=p(()=>{b=new Map,W=G.showData,et()},"clear"),gt=p(({label:t,value:a})=>{b.has(t)||(b.set(t,a),F.debug(`added new section: ${t}, with value: ${a}`))},"addSection"),ft=p(()=>b,"getSections"),mt=p(t=>{W=t},"setShowData"),ht=p(()=>W,"getShowData"),R={getConfig:ut,clear:dt,setDiagramTitle:Q,getDiagramTitle:K,setAccTitle:H,getAccTitle:q,setAccDescription:j,getAccDescription:U,addSection:gt,getSections:ft,setShowData:mt,getShowData:ht},vt=p((t,a)=>{V(t,a),a.setShowData(t.showData),t.sections.map(a.addSection)},"populateDb"),St={parse:p(async t=>{const a=await nt("pie",t);F.debug(a),vt(a,R)},"parse")},yt=p(t=>`
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
`,"getStyles"),xt=yt,At=p(t=>{const a=[...t.entries()].map(s=>({label:s[0],value:s[1]})).sort((s,u)=>u.value-s.value);return lt().value(s=>s.value)(a)},"createPieArcs"),wt=p((t,a,h,s)=>{F.debug(`rendering pie chart
`+t);const u=s.db,x=Z(),i=J(u.getConfig(),x.pie),e=40,r=18,l=4,d=450,A=d,v=X(a),c=v.append("g");c.attr("transform","translate("+A/2+","+d/2+")");const{themeVariables:n}=x;let[f]=Y(n.pieOuterStrokeWidth);f??(f=2);const w=i.textPosition,m=Math.min(A,d)/2-e,T=P().innerRadius(0).outerRadius(m),$=P().innerRadius(m*w).outerRadius(m*w);c.append("circle").attr("cx",0).attr("cy",0).attr("r",m+f/2).attr("class","pieOuterCircle");const g=u.getSections(),S=At(g),C=[n.pie1,n.pie2,n.pie3,n.pie4,n.pie5,n.pie6,n.pie7,n.pie8,n.pie9,n.pie10,n.pie11,n.pie12],D=it(C);c.selectAll("mySlices").data(S).enter().append("path").attr("d",T).attr("fill",o=>D(o.data.label)).attr("class","pieCircle");let N=0;g.forEach(o=>{N+=o}),c.selectAll("mySlices").data(S).enter().append("text").text(o=>(o.data.value/N*100).toFixed(0)+"%").attr("transform",o=>"translate("+$.centroid(o)+")").style("text-anchor","middle").attr("class","slice"),c.append("text").text(u.getDiagramTitle()).attr("x",0).attr("y",-400/2).attr("class","pieTitleText");const M=c.selectAll(".legend").data(D.domain()).enter().append("g").attr("class","legend").attr("transform",(o,E)=>{const k=r+l,L=k*D.domain().length/2,_=12*r,B=E*k-L;return"translate("+_+","+B+")"});M.append("rect").attr("width",r).attr("height",r).style("fill",D).style("stroke",D),M.data(S).append("text").attr("x",r+l).attr("y",r-l).text(o=>{const{label:E,value:k}=o.data;return u.getShowData()?`${E} [${k}]`:E});const I=Math.max(...M.selectAll("text").nodes().map(o=>o?.getBoundingClientRect().width??0)),O=A+e+r+l+I;v.attr("viewBox",`0 0 ${O} ${d}`),tt(v,d,O,i.useMaxWidth)},"draw"),Ct={draw:wt},Rt={parser:St,db:R,renderer:Ct,styles:xt};export{Rt as diagram};
