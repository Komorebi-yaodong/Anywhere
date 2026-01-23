import{_ as p,g as j,s as q,a as H,b as K,t as Q,q as Z,l as F,c as J,F as X,K as Y,a4 as tt,e as et,z as at,H as rt,Q as S,aE as nt,T as z}from"./mermaid.core-B0WXDFZp-8azMCypT.js";import{p as it}from"./chunk-4BX2VUAB-AWtG75oi-5gomADYj.js";import{p as st}from"./treemap-75Q7IDZK-BVE2z8EB-BDRzzYsa.js";import{d as I}from"./arc-DKxWWLDg-B2OTkHiP.js";import{o as ot}from"./ordinal-DSZU4PqD-DOFoVEQk.js";import"./mermaid-PPVm8Dsz.js";import"./ChatMessage-Bl9pd1C6.js";import"./element-plus-B_ceYB1O.js";import"./vendor-utils-Biw9DGem.js";import"./index-CkHcsYOr.js";import"./_baseUniq-CuM2RS0h-CgrtooLh.js";import"./min-cDCw1MM3-ByhT3Un0.js";import"./clone-CYku6Kza-B-1ZAZR5.js";import"./init-ZxktEp_H-Gi6I4Gst.js";function lt(t,a){return a<t?-1:a>t?1:a>=t?0:NaN}function ct(t){return t}function ut(){var t=ct,a=lt,f=null,x=S(0),s=S(z),l=S(0);function o(e){var n,c=(e=nt(e)).length,d,y,v=0,u=new Array(c),i=new Array(c),m=+x.apply(this,arguments),w=Math.min(z,Math.max(-z,s.apply(this,arguments)-m)),h,C=Math.min(Math.abs(w)/c,l.apply(this,arguments)),$=C*(w<0?-1:1),g;for(n=0;n<c;++n)(g=i[u[n]=n]=+t(e[n],n,e))>0&&(v+=g);for(a!=null?u.sort(function(A,D){return a(i[A],i[D])}):f!=null&&u.sort(function(A,D){return f(e[A],e[D])}),n=0,y=v?(w-c*$)/v:0;n<c;++n,m=h)d=u[n],g=i[d],h=m+(g>0?g*y:0)+$,i[d]={data:e[d],index:n,value:g,startAngle:m,endAngle:h,padAngle:C};return i}return o.value=function(e){return arguments.length?(t=typeof e=="function"?e:S(+e),o):t},o.sortValues=function(e){return arguments.length?(a=e,f=null,o):a},o.sort=function(e){return arguments.length?(f=e,a=null,o):f},o.startAngle=function(e){return arguments.length?(x=typeof e=="function"?e:S(+e),o):x},o.endAngle=function(e){return arguments.length?(s=typeof e=="function"?e:S(+e),o):s},o.padAngle=function(e){return arguments.length?(l=typeof e=="function"?e:S(+e),o):l},o}var pt=rt.pie,G={sections:new Map,showData:!1},T=G.sections,N=G.showData,dt=structuredClone(pt),gt=p(()=>structuredClone(dt),"getConfig"),ft=p(()=>{T=new Map,N=G.showData,at()},"clear"),mt=p(({label:t,value:a})=>{if(a<0)throw new Error(`"${t}" has invalid value: ${a}. Negative values are not allowed in pie charts. All slice values must be >= 0.`);T.has(t)||(T.set(t,a),F.debug(`added new section: ${t}, with value: ${a}`))},"addSection"),ht=p(()=>T,"getSections"),vt=p(t=>{N=t},"setShowData"),St=p(()=>N,"getShowData"),L={getConfig:gt,clear:ft,setDiagramTitle:Z,getDiagramTitle:Q,setAccTitle:K,getAccTitle:H,setAccDescription:q,getAccDescription:j,addSection:mt,getSections:ht,setShowData:vt,getShowData:St},xt=p((t,a)=>{it(t,a),a.setShowData(t.showData),t.sections.map(a.addSection)},"populateDb"),yt={parse:p(async t=>{const a=await st("pie",t);F.debug(a),xt(a,L)},"parse")},wt=p(t=>`
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
`,"getStyles"),At=wt,Dt=p(t=>{const a=[...t.values()].reduce((s,l)=>s+l,0),f=[...t.entries()].map(([s,l])=>({label:s,value:l})).filter(s=>s.value/a*100>=1).sort((s,l)=>l.value-s.value);return ut().value(s=>s.value)(f)},"createPieArcs"),Ct=p((t,a,f,x)=>{F.debug(`rendering pie chart
`+t);const s=x.db,l=J(),o=X(s.getConfig(),l.pie),e=40,n=18,c=4,d=450,y=d,v=Y(a),u=v.append("g");u.attr("transform","translate("+y/2+","+d/2+")");const{themeVariables:i}=l;let[m]=tt(i.pieOuterStrokeWidth);m??(m=2);const w=o.textPosition,h=Math.min(y,d)/2-e,C=I().innerRadius(0).outerRadius(h),$=I().innerRadius(h*w).outerRadius(h*w);u.append("circle").attr("cx",0).attr("cy",0).attr("r",h+m/2).attr("class","pieOuterCircle");const g=s.getSections(),A=Dt(g),D=[i.pie1,i.pie2,i.pie3,i.pie4,i.pie5,i.pie6,i.pie7,i.pie8,i.pie9,i.pie10,i.pie11,i.pie12];let E=0;g.forEach(r=>{E+=r});const W=A.filter(r=>(r.data.value/E*100).toFixed(0)!=="0"),b=ot(D);u.selectAll("mySlices").data(W).enter().append("path").attr("d",C).attr("fill",r=>b(r.data.label)).attr("class","pieCircle"),u.selectAll("mySlices").data(W).enter().append("text").text(r=>(r.data.value/E*100).toFixed(0)+"%").attr("transform",r=>"translate("+$.centroid(r)+")").style("text-anchor","middle").attr("class","slice"),u.append("text").text(s.getDiagramTitle()).attr("x",0).attr("y",-400/2).attr("class","pieTitleText");const O=[...g.entries()].map(([r,M])=>({label:r,value:M})),k=u.selectAll(".legend").data(O).enter().append("g").attr("class","legend").attr("transform",(r,M)=>{const R=n+c,B=R*O.length/2,V=12*n,U=M*R-B;return"translate("+V+","+U+")"});k.append("rect").attr("width",n).attr("height",n).style("fill",r=>b(r.label)).style("stroke",r=>b(r.label)),k.append("text").attr("x",n+c).attr("y",n-c).text(r=>s.getShowData()?`${r.label} [${r.value}]`:r.label);const _=Math.max(...k.selectAll("text").nodes().map(r=>r?.getBoundingClientRect().width??0)),P=y+e+n+c+_;v.attr("viewBox",`0 0 ${P} ${d}`),et(v,d,P,o.useMaxWidth)},"draw"),$t={draw:Ct},Lt={parser:yt,db:L,renderer:$t,styles:At};export{Lt as diagram};
