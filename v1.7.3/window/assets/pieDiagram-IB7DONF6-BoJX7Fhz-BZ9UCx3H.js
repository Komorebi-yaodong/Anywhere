import{p as U}from"./chunk-4BMEZGHF-Byc923bM-CEoFxmpS.js";import{_ as u,o as V,n as j,q,r as H,I as Z,H as J,l as F,g as K,S as Q,a4 as X,a6 as Y,v as tt,N as et,U as at,a7 as y,a8 as rt,a9 as z}from"./index-DG-pP0nC.js";import{p as nt}from"./radar-MK3ICKWK-CiNWpY4n-CnYj753g.js";import{d as O}from"./arc-Bj1iKruZ-DHfY_KfR.js";import{o as it}from"./ordinal-DSZU4PqD-DOFoVEQk.js";import"./_baseUniq-CyBKxUBB-D5XPoxbK.js";import"./min-DKZp8rBd-T2ypRsi3.js";import"./clone-CS7zTRQj-BY2mKfTg.js";import"./init-ZxktEp_H-Gi6I4Gst.js";function st(t,a){return a<t?-1:a>t?1:a>=t?0:NaN}function ot(t){return t}function lt(){var t=ot,a=st,h=null,o=y(0),p=y(z),x=y(0);function i(e){var r,l=(e=rt(e)).length,d,A,v=0,c=new Array(l),n=new Array(l),f=+o.apply(this,arguments),w=Math.min(z,Math.max(-z,p.apply(this,arguments)-f)),m,$=Math.min(Math.abs(w)/l,x.apply(this,arguments)),T=$*(w<0?-1:1),g;for(r=0;r<l;++r)(g=n[c[r]=r]=+t(e[r],r,e))>0&&(v+=g);for(a!=null?c.sort(function(S,C){return a(n[S],n[C])}):h!=null&&c.sort(function(S,C){return h(e[S],e[C])}),r=0,A=v?(w-l*T)/v:0;r<l;++r,f=m)d=c[r],g=n[d],m=f+(g>0?g*A:0)+T,n[d]={data:e[d],index:r,value:g,startAngle:f,endAngle:m,padAngle:$};return n}return i.value=function(e){return arguments.length?(t=typeof e=="function"?e:y(+e),i):t},i.sortValues=function(e){return arguments.length?(a=e,h=null,i):a},i.sort=function(e){return arguments.length?(h=e,a=null,i):h},i.startAngle=function(e){return arguments.length?(o=typeof e=="function"?e:y(+e),i):o},i.endAngle=function(e){return arguments.length?(p=typeof e=="function"?e:y(+e),i):p},i.padAngle=function(e){return arguments.length?(x=typeof e=="function"?e:y(+e),i):x},i}var ct=at.pie,G={sections:new Map,showData:!1},M=G.sections,N=G.showData,ut=structuredClone(ct),pt=u(()=>structuredClone(ut),"getConfig"),dt=u(()=>{M=new Map,N=G.showData,et()},"clear"),gt=u(({label:t,value:a})=>{M.has(t)||(M.set(t,a),F.debug(`added new section: ${t}, with value: ${a}`))},"addSection"),ft=u(()=>M,"getSections"),mt=u(t=>{N=t},"setShowData"),ht=u(()=>N,"getShowData"),P={getConfig:pt,clear:dt,setDiagramTitle:J,getDiagramTitle:Z,setAccTitle:H,getAccTitle:q,setAccDescription:j,getAccDescription:V,addSection:gt,getSections:ft,setShowData:mt,getShowData:ht},vt=u((t,a)=>{U(t,a),a.setShowData(t.showData),t.sections.map(a.addSection)},"populateDb"),St={parse:u(async t=>{const a=await nt("pie",t);F.debug(a),vt(a,P)},"parse")},yt=u(t=>`
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
`+t);const p=o.db,x=K(),i=Q(p.getConfig(),x.pie),e=40,r=18,l=4,d=450,A=d,v=X(a),c=v.append("g");c.attr("transform","translate("+A/2+","+d/2+")");const{themeVariables:n}=x;let[f]=Y(n.pieOuterStrokeWidth);f??(f=2);const w=i.textPosition,m=Math.min(A,d)/2-e,$=O().innerRadius(0).outerRadius(m),T=O().innerRadius(m*w).outerRadius(m*w);c.append("circle").attr("cx",0).attr("cy",0).attr("r",m+f/2).attr("class","pieOuterCircle");const g=p.getSections(),S=At(g),C=[n.pie1,n.pie2,n.pie3,n.pie4,n.pie5,n.pie6,n.pie7,n.pie8,n.pie9,n.pie10,n.pie11,n.pie12],D=it(C);c.selectAll("mySlices").data(S).enter().append("path").attr("d",$).attr("fill",s=>D(s.data.label)).attr("class","pieCircle");let W=0;g.forEach(s=>{W+=s}),c.selectAll("mySlices").data(S).enter().append("text").text(s=>(s.data.value/W*100).toFixed(0)+"%").attr("transform",s=>"translate("+T.centroid(s)+")").style("text-anchor","middle").attr("class","slice"),c.append("text").text(p.getDiagramTitle()).attr("x",0).attr("y",-400/2).attr("class","pieTitleText");const b=c.selectAll(".legend").data(D.domain()).enter().append("g").attr("class","legend").attr("transform",(s,k)=>{const E=r+l,L=E*D.domain().length/2,_=12*r,B=k*E-L;return"translate("+_+","+B+")"});b.append("rect").attr("width",r).attr("height",r).style("fill",D).style("stroke",D),b.data(S).append("text").attr("x",r+l).attr("y",r-l).text(s=>{const{label:k,value:E}=s.data;return p.getShowData()?`${k} [${E}]`:k});const R=Math.max(...b.selectAll("text").nodes().map(s=>(s==null?void 0:s.getBoundingClientRect().width)??0)),I=A+e+r+l+R;v.attr("viewBox",`0 0 ${I} ${d}`),tt(v,d,I,i.useMaxWidth)},"draw"),Ct={draw:wt},Gt={parser:St,db:P,renderer:Ct,styles:xt};export{Gt as diagram};
