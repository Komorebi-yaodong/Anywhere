import{g as re,s as ae}from"./chunk-RZ5BOZE2-CECkVDFV-CzlgtKuA.js";import{_ as h,l as b,g as A,F as ne,G as le,aH as oe,B as U,N as ce,q as he,r as ue,o as de,n as fe,H as pe,I as Se}from"./index-1GcRBWxe.js";var ye=Object.defineProperty,ge=(t,e,n)=>e in t?ye(t,e,{enumerable:!0,configurable:!0,writable:!0,value:n}):t[e]=n,v=(t,e,n)=>ge(t,typeof e!="symbol"?e+"":e,n),ht,vt=function(){var t=h(function($,l,o,a){for(o=o||{},a=$.length;a--;o[$[a]]=l);return o},"o"),e=[1,2],n=[1,3],r=[1,4],u=[2,4],i=[1,9],p=[1,11],_=[1,16],d=[1,17],E=[1,18],S=[1,19],C=[1,32],j=[1,20],B=[1,21],I=[1,22],f=[1,23],L=[1,24],R=[1,26],G=[1,27],F=[1,28],N=[1,29],w=[1,30],tt=[1,31],et=[1,34],st=[1,35],it=[1,36],rt=[1,37],W=[1,33],y=[1,4,5,16,17,19,21,22,24,25,26,27,28,29,33,35,37,38,42,45,48,49,50,51,54],at=[1,4,5,14,15,16,17,19,21,22,24,25,26,27,28,29,33,35,37,38,42,45,48,49,50,51,54],At=[4,5,16,17,19,21,22,24,25,26,27,28,29,33,35,37,38,42,45,48,49,50,51,54],St={trace:h(function(){},"trace"),yy:{},symbols_:{error:2,start:3,SPACE:4,NL:5,SD:6,document:7,line:8,statement:9,classDefStatement:10,styleStatement:11,cssClassStatement:12,idStatement:13,DESCR:14,"-->":15,HIDE_EMPTY:16,scale:17,WIDTH:18,COMPOSIT_STATE:19,STRUCT_START:20,STRUCT_STOP:21,STATE_DESCR:22,AS:23,ID:24,FORK:25,JOIN:26,CHOICE:27,CONCURRENT:28,note:29,notePosition:30,NOTE_TEXT:31,direction:32,acc_title:33,acc_title_value:34,acc_descr:35,acc_descr_value:36,acc_descr_multiline_value:37,classDef:38,CLASSDEF_ID:39,CLASSDEF_STYLEOPTS:40,DEFAULT:41,style:42,STYLE_IDS:43,STYLEDEF_STYLEOPTS:44,class:45,CLASSENTITY_IDS:46,STYLECLASS:47,direction_tb:48,direction_bt:49,direction_rl:50,direction_lr:51,eol:52,";":53,EDGE_STATE:54,STYLE_SEPARATOR:55,left_of:56,right_of:57,$accept:0,$end:1},terminals_:{2:"error",4:"SPACE",5:"NL",6:"SD",14:"DESCR",15:"-->",16:"HIDE_EMPTY",17:"scale",18:"WIDTH",19:"COMPOSIT_STATE",20:"STRUCT_START",21:"STRUCT_STOP",22:"STATE_DESCR",23:"AS",24:"ID",25:"FORK",26:"JOIN",27:"CHOICE",28:"CONCURRENT",29:"note",31:"NOTE_TEXT",33:"acc_title",34:"acc_title_value",35:"acc_descr",36:"acc_descr_value",37:"acc_descr_multiline_value",38:"classDef",39:"CLASSDEF_ID",40:"CLASSDEF_STYLEOPTS",41:"DEFAULT",42:"style",43:"STYLE_IDS",44:"STYLEDEF_STYLEOPTS",45:"class",46:"CLASSENTITY_IDS",47:"STYLECLASS",48:"direction_tb",49:"direction_bt",50:"direction_rl",51:"direction_lr",53:";",54:"EDGE_STATE",55:"STYLE_SEPARATOR",56:"left_of",57:"right_of"},productions_:[0,[3,2],[3,2],[3,2],[7,0],[7,2],[8,2],[8,1],[8,1],[9,1],[9,1],[9,1],[9,1],[9,2],[9,3],[9,4],[9,1],[9,2],[9,1],[9,4],[9,3],[9,6],[9,1],[9,1],[9,1],[9,1],[9,4],[9,4],[9,1],[9,2],[9,2],[9,1],[10,3],[10,3],[11,3],[12,3],[32,1],[32,1],[32,1],[32,1],[52,1],[52,1],[13,1],[13,1],[13,3],[13,3],[30,1],[30,1]],performAction:h(function(l,o,a,g,T,s,X){var c=s.length-1;switch(T){case 3:return g.setRootDoc(s[c]),s[c];case 4:this.$=[];break;case 5:s[c]!="nl"&&(s[c-1].push(s[c]),this.$=s[c-1]);break;case 6:case 7:this.$=s[c];break;case 8:this.$="nl";break;case 12:this.$=s[c];break;case 13:const K=s[c-1];K.description=g.trimColon(s[c]),this.$=K;break;case 14:this.$={stmt:"relation",state1:s[c-2],state2:s[c]};break;case 15:const yt=g.trimColon(s[c]);this.$={stmt:"relation",state1:s[c-3],state2:s[c-1],description:yt};break;case 19:this.$={stmt:"state",id:s[c-3],type:"default",description:"",doc:s[c-1]};break;case 20:var Y=s[c],H=s[c-2].trim();if(s[c].match(":")){var lt=s[c].split(":");Y=lt[0],H=[H,lt[1]]}this.$={stmt:"state",id:Y,type:"default",description:H};break;case 21:this.$={stmt:"state",id:s[c-3],type:"default",description:s[c-5],doc:s[c-1]};break;case 22:this.$={stmt:"state",id:s[c],type:"fork"};break;case 23:this.$={stmt:"state",id:s[c],type:"join"};break;case 24:this.$={stmt:"state",id:s[c],type:"choice"};break;case 25:this.$={stmt:"state",id:g.getDividerId(),type:"divider"};break;case 26:this.$={stmt:"state",id:s[c-1].trim(),note:{position:s[c-2].trim(),text:s[c].trim()}};break;case 29:this.$=s[c].trim(),g.setAccTitle(this.$);break;case 30:case 31:this.$=s[c].trim(),g.setAccDescription(this.$);break;case 32:case 33:this.$={stmt:"classDef",id:s[c-1].trim(),classes:s[c].trim()};break;case 34:this.$={stmt:"style",id:s[c-1].trim(),styleClass:s[c].trim()};break;case 35:this.$={stmt:"applyClass",id:s[c-1].trim(),styleClass:s[c].trim()};break;case 36:g.setDirection("TB"),this.$={stmt:"dir",value:"TB"};break;case 37:g.setDirection("BT"),this.$={stmt:"dir",value:"BT"};break;case 38:g.setDirection("RL"),this.$={stmt:"dir",value:"RL"};break;case 39:g.setDirection("LR"),this.$={stmt:"dir",value:"LR"};break;case 42:case 43:this.$={stmt:"state",id:s[c].trim(),type:"default",description:""};break;case 44:this.$={stmt:"state",id:s[c-2].trim(),classes:[s[c].trim()],type:"default",description:""};break;case 45:this.$={stmt:"state",id:s[c-2].trim(),classes:[s[c].trim()],type:"default",description:""};break}},"anonymous"),table:[{3:1,4:e,5:n,6:r},{1:[3]},{3:5,4:e,5:n,6:r},{3:6,4:e,5:n,6:r},t([1,4,5,16,17,19,22,24,25,26,27,28,29,33,35,37,38,42,45,48,49,50,51,54],u,{7:7}),{1:[2,1]},{1:[2,2]},{1:[2,3],4:i,5:p,8:8,9:10,10:12,11:13,12:14,13:15,16:_,17:d,19:E,22:S,24:C,25:j,26:B,27:I,28:f,29:L,32:25,33:R,35:G,37:F,38:N,42:w,45:tt,48:et,49:st,50:it,51:rt,54:W},t(y,[2,5]),{9:38,10:12,11:13,12:14,13:15,16:_,17:d,19:E,22:S,24:C,25:j,26:B,27:I,28:f,29:L,32:25,33:R,35:G,37:F,38:N,42:w,45:tt,48:et,49:st,50:it,51:rt,54:W},t(y,[2,7]),t(y,[2,8]),t(y,[2,9]),t(y,[2,10]),t(y,[2,11]),t(y,[2,12],{14:[1,39],15:[1,40]}),t(y,[2,16]),{18:[1,41]},t(y,[2,18],{20:[1,42]}),{23:[1,43]},t(y,[2,22]),t(y,[2,23]),t(y,[2,24]),t(y,[2,25]),{30:44,31:[1,45],56:[1,46],57:[1,47]},t(y,[2,28]),{34:[1,48]},{36:[1,49]},t(y,[2,31]),{39:[1,50],41:[1,51]},{43:[1,52]},{46:[1,53]},t(at,[2,42],{55:[1,54]}),t(at,[2,43],{55:[1,55]}),t(y,[2,36]),t(y,[2,37]),t(y,[2,38]),t(y,[2,39]),t(y,[2,6]),t(y,[2,13]),{13:56,24:C,54:W},t(y,[2,17]),t(At,u,{7:57}),{24:[1,58]},{24:[1,59]},{23:[1,60]},{24:[2,46]},{24:[2,47]},t(y,[2,29]),t(y,[2,30]),{40:[1,61]},{40:[1,62]},{44:[1,63]},{47:[1,64]},{24:[1,65]},{24:[1,66]},t(y,[2,14],{14:[1,67]}),{4:i,5:p,8:8,9:10,10:12,11:13,12:14,13:15,16:_,17:d,19:E,21:[1,68],22:S,24:C,25:j,26:B,27:I,28:f,29:L,32:25,33:R,35:G,37:F,38:N,42:w,45:tt,48:et,49:st,50:it,51:rt,54:W},t(y,[2,20],{20:[1,69]}),{31:[1,70]},{24:[1,71]},t(y,[2,32]),t(y,[2,33]),t(y,[2,34]),t(y,[2,35]),t(at,[2,44]),t(at,[2,45]),t(y,[2,15]),t(y,[2,19]),t(At,u,{7:72}),t(y,[2,26]),t(y,[2,27]),{4:i,5:p,8:8,9:10,10:12,11:13,12:14,13:15,16:_,17:d,19:E,21:[1,73],22:S,24:C,25:j,26:B,27:I,28:f,29:L,32:25,33:R,35:G,37:F,38:N,42:w,45:tt,48:et,49:st,50:it,51:rt,54:W},t(y,[2,21])],defaultActions:{5:[2,1],6:[2,2],46:[2,46],47:[2,47]},parseError:h(function(l,o){if(o.recoverable)this.trace(l);else{var a=new Error(l);throw a.hash=o,a}},"parseError"),parse:h(function(l){var o=this,a=[0],g=[],T=[null],s=[],X=this.table,c="",Y=0,H=0,lt=2,K=1,yt=s.slice.call(arguments,1),m=Object.create(this.lexer),V={yy:{}};for(var gt in this.yy)Object.prototype.hasOwnProperty.call(this.yy,gt)&&(V.yy[gt]=this.yy[gt]);m.setInput(l,V.yy),V.yy.lexer=m,V.yy.parser=this,typeof m.yylloc>"u"&&(m.yylloc={});var _t=m.yylloc;s.push(_t);var se=m.options&&m.options.ranges;typeof V.yy.parseError=="function"?this.parseError=V.yy.parseError:this.parseError=Object.getPrototypeOf(this).parseError;function ie(k){a.length=a.length-2*k,T.length=T.length-k,s.length=s.length-k}h(ie,"popStack");function Lt(){var k;return k=g.pop()||m.lex()||K,typeof k!="number"&&(k instanceof Array&&(g=k,k=g.pop()),k=o.symbols_[k]||k),k}h(Lt,"lex");for(var D,M,x,Tt,z={},ot,O,It,ct;;){if(M=a[a.length-1],this.defaultActions[M]?x=this.defaultActions[M]:((D===null||typeof D>"u")&&(D=Lt()),x=X[M]&&X[M][D]),typeof x>"u"||!x.length||!x[0]){var Et="";ct=[];for(ot in X[M])this.terminals_[ot]&&ot>lt&&ct.push("'"+this.terminals_[ot]+"'");m.showPosition?Et="Parse error on line "+(Y+1)+`:
`+m.showPosition()+`
Expecting `+ct.join(", ")+", got '"+(this.terminals_[D]||D)+"'":Et="Parse error on line "+(Y+1)+": Unexpected "+(D==K?"end of input":"'"+(this.terminals_[D]||D)+"'"),this.parseError(Et,{text:m.match,token:this.terminals_[D]||D,line:m.yylineno,loc:_t,expected:ct})}if(x[0]instanceof Array&&x.length>1)throw new Error("Parse Error: multiple actions possible at state: "+M+", token: "+D);switch(x[0]){case 1:a.push(D),T.push(m.yytext),s.push(m.yylloc),a.push(x[1]),D=null,H=m.yyleng,c=m.yytext,Y=m.yylineno,_t=m.yylloc;break;case 2:if(O=this.productions_[x[1]][1],z.$=T[T.length-O],z._$={first_line:s[s.length-(O||1)].first_line,last_line:s[s.length-1].last_line,first_column:s[s.length-(O||1)].first_column,last_column:s[s.length-1].last_column},se&&(z._$.range=[s[s.length-(O||1)].range[0],s[s.length-1].range[1]]),Tt=this.performAction.apply(z,[c,H,Y,V.yy,x[1],T,s].concat(yt)),typeof Tt<"u")return Tt;O&&(a=a.slice(0,-1*O*2),T=T.slice(0,-1*O),s=s.slice(0,-1*O)),a.push(this.productions_[x[1]][0]),T.push(z.$),s.push(z._$),It=X[a[a.length-2]][a[a.length-1]],a.push(It);break;case 3:return!0}}return!0},"parse")},ee=function(){var $={EOF:1,parseError:h(function(o,a){if(this.yy.parser)this.yy.parser.parseError(o,a);else throw new Error(o)},"parseError"),setInput:h(function(l,o){return this.yy=o||this.yy||{},this._input=l,this._more=this._backtrack=this.done=!1,this.yylineno=this.yyleng=0,this.yytext=this.matched=this.match="",this.conditionStack=["INITIAL"],this.yylloc={first_line:1,first_column:0,last_line:1,last_column:0},this.options.ranges&&(this.yylloc.range=[0,0]),this.offset=0,this},"setInput"),input:h(function(){var l=this._input[0];this.yytext+=l,this.yyleng++,this.offset++,this.match+=l,this.matched+=l;var o=l.match(/(?:\r\n?|\n).*/g);return o?(this.yylineno++,this.yylloc.last_line++):this.yylloc.last_column++,this.options.ranges&&this.yylloc.range[1]++,this._input=this._input.slice(1),l},"input"),unput:h(function(l){var o=l.length,a=l.split(/(?:\r\n?|\n)/g);this._input=l+this._input,this.yytext=this.yytext.substr(0,this.yytext.length-o),this.offset-=o;var g=this.match.split(/(?:\r\n?|\n)/g);this.match=this.match.substr(0,this.match.length-1),this.matched=this.matched.substr(0,this.matched.length-1),a.length-1&&(this.yylineno-=a.length-1);var T=this.yylloc.range;return this.yylloc={first_line:this.yylloc.first_line,last_line:this.yylineno+1,first_column:this.yylloc.first_column,last_column:a?(a.length===g.length?this.yylloc.first_column:0)+g[g.length-a.length].length-a[0].length:this.yylloc.first_column-o},this.options.ranges&&(this.yylloc.range=[T[0],T[0]+this.yyleng-o]),this.yyleng=this.yytext.length,this},"unput"),more:h(function(){return this._more=!0,this},"more"),reject:h(function(){if(this.options.backtrack_lexer)this._backtrack=!0;else return this.parseError("Lexical error on line "+(this.yylineno+1)+`. You can only invoke reject() in the lexer when the lexer is of the backtracking persuasion (options.backtrack_lexer = true).
`+this.showPosition(),{text:"",token:null,line:this.yylineno});return this},"reject"),less:h(function(l){this.unput(this.match.slice(l))},"less"),pastInput:h(function(){var l=this.matched.substr(0,this.matched.length-this.match.length);return(l.length>20?"...":"")+l.substr(-20).replace(/\n/g,"")},"pastInput"),upcomingInput:h(function(){var l=this.match;return l.length<20&&(l+=this._input.substr(0,20-l.length)),(l.substr(0,20)+(l.length>20?"...":"")).replace(/\n/g,"")},"upcomingInput"),showPosition:h(function(){var l=this.pastInput(),o=new Array(l.length+1).join("-");return l+this.upcomingInput()+`
`+o+"^"},"showPosition"),test_match:h(function(l,o){var a,g,T;if(this.options.backtrack_lexer&&(T={yylineno:this.yylineno,yylloc:{first_line:this.yylloc.first_line,last_line:this.last_line,first_column:this.yylloc.first_column,last_column:this.yylloc.last_column},yytext:this.yytext,match:this.match,matches:this.matches,matched:this.matched,yyleng:this.yyleng,offset:this.offset,_more:this._more,_input:this._input,yy:this.yy,conditionStack:this.conditionStack.slice(0),done:this.done},this.options.ranges&&(T.yylloc.range=this.yylloc.range.slice(0))),g=l[0].match(/(?:\r\n?|\n).*/g),g&&(this.yylineno+=g.length),this.yylloc={first_line:this.yylloc.last_line,last_line:this.yylineno+1,first_column:this.yylloc.last_column,last_column:g?g[g.length-1].length-g[g.length-1].match(/\r?\n?/)[0].length:this.yylloc.last_column+l[0].length},this.yytext+=l[0],this.match+=l[0],this.matches=l,this.yyleng=this.yytext.length,this.options.ranges&&(this.yylloc.range=[this.offset,this.offset+=this.yyleng]),this._more=!1,this._backtrack=!1,this._input=this._input.slice(l[0].length),this.matched+=l[0],a=this.performAction.call(this,this.yy,this,o,this.conditionStack[this.conditionStack.length-1]),this.done&&this._input&&(this.done=!1),a)return a;if(this._backtrack){for(var s in T)this[s]=T[s];return!1}return!1},"test_match"),next:h(function(){if(this.done)return this.EOF;this._input||(this.done=!0);var l,o,a,g;this._more||(this.yytext="",this.match="");for(var T=this._currentRules(),s=0;s<T.length;s++)if(a=this._input.match(this.rules[T[s]]),a&&(!o||a[0].length>o[0].length)){if(o=a,g=s,this.options.backtrack_lexer){if(l=this.test_match(a,T[s]),l!==!1)return l;if(this._backtrack){o=!1;continue}else return!1}else if(!this.options.flex)break}return o?(l=this.test_match(o,T[g]),l!==!1?l:!1):this._input===""?this.EOF:this.parseError("Lexical error on line "+(this.yylineno+1)+`. Unrecognized text.
`+this.showPosition(),{text:"",token:null,line:this.yylineno})},"next"),lex:h(function(){var o=this.next();return o||this.lex()},"lex"),begin:h(function(o){this.conditionStack.push(o)},"begin"),popState:h(function(){var o=this.conditionStack.length-1;return o>0?this.conditionStack.pop():this.conditionStack[0]},"popState"),_currentRules:h(function(){return this.conditionStack.length&&this.conditionStack[this.conditionStack.length-1]?this.conditions[this.conditionStack[this.conditionStack.length-1]].rules:this.conditions.INITIAL.rules},"_currentRules"),topState:h(function(o){return o=this.conditionStack.length-1-Math.abs(o||0),o>=0?this.conditionStack[o]:"INITIAL"},"topState"),pushState:h(function(o){this.begin(o)},"pushState"),stateStackSize:h(function(){return this.conditionStack.length},"stateStackSize"),options:{"case-insensitive":!0},performAction:h(function(o,a,g,T){switch(g){case 0:return 41;case 1:return 48;case 2:return 49;case 3:return 50;case 4:return 51;case 5:break;case 6:break;case 7:return 5;case 8:break;case 9:break;case 10:break;case 11:break;case 12:return this.pushState("SCALE"),17;case 13:return 18;case 14:this.popState();break;case 15:return this.begin("acc_title"),33;case 16:return this.popState(),"acc_title_value";case 17:return this.begin("acc_descr"),35;case 18:return this.popState(),"acc_descr_value";case 19:this.begin("acc_descr_multiline");break;case 20:this.popState();break;case 21:return"acc_descr_multiline_value";case 22:return this.pushState("CLASSDEF"),38;case 23:return this.popState(),this.pushState("CLASSDEFID"),"DEFAULT_CLASSDEF_ID";case 24:return this.popState(),this.pushState("CLASSDEFID"),39;case 25:return this.popState(),40;case 26:return this.pushState("CLASS"),45;case 27:return this.popState(),this.pushState("CLASS_STYLE"),46;case 28:return this.popState(),47;case 29:return this.pushState("STYLE"),42;case 30:return this.popState(),this.pushState("STYLEDEF_STYLES"),43;case 31:return this.popState(),44;case 32:return this.pushState("SCALE"),17;case 33:return 18;case 34:this.popState();break;case 35:this.pushState("STATE");break;case 36:return this.popState(),a.yytext=a.yytext.slice(0,-8).trim(),25;case 37:return this.popState(),a.yytext=a.yytext.slice(0,-8).trim(),26;case 38:return this.popState(),a.yytext=a.yytext.slice(0,-10).trim(),27;case 39:return this.popState(),a.yytext=a.yytext.slice(0,-8).trim(),25;case 40:return this.popState(),a.yytext=a.yytext.slice(0,-8).trim(),26;case 41:return this.popState(),a.yytext=a.yytext.slice(0,-10).trim(),27;case 42:return 48;case 43:return 49;case 44:return 50;case 45:return 51;case 46:this.pushState("STATE_STRING");break;case 47:return this.pushState("STATE_ID"),"AS";case 48:return this.popState(),"ID";case 49:this.popState();break;case 50:return"STATE_DESCR";case 51:return 19;case 52:this.popState();break;case 53:return this.popState(),this.pushState("struct"),20;case 54:break;case 55:return this.popState(),21;case 56:break;case 57:return this.begin("NOTE"),29;case 58:return this.popState(),this.pushState("NOTE_ID"),56;case 59:return this.popState(),this.pushState("NOTE_ID"),57;case 60:this.popState(),this.pushState("FLOATING_NOTE");break;case 61:return this.popState(),this.pushState("FLOATING_NOTE_ID"),"AS";case 62:break;case 63:return"NOTE_TEXT";case 64:return this.popState(),"ID";case 65:return this.popState(),this.pushState("NOTE_TEXT"),24;case 66:return this.popState(),a.yytext=a.yytext.substr(2).trim(),31;case 67:return this.popState(),a.yytext=a.yytext.slice(0,-8).trim(),31;case 68:return 6;case 69:return 6;case 70:return 16;case 71:return 54;case 72:return 24;case 73:return a.yytext=a.yytext.trim(),14;case 74:return 15;case 75:return 28;case 76:return 55;case 77:return 5;case 78:return"INVALID"}},"anonymous"),rules:[/^(?:default\b)/i,/^(?:.*direction\s+TB[^\n]*)/i,/^(?:.*direction\s+BT[^\n]*)/i,/^(?:.*direction\s+RL[^\n]*)/i,/^(?:.*direction\s+LR[^\n]*)/i,/^(?:%%(?!\{)[^\n]*)/i,/^(?:[^\}]%%[^\n]*)/i,/^(?:[\n]+)/i,/^(?:[\s]+)/i,/^(?:((?!\n)\s)+)/i,/^(?:#[^\n]*)/i,/^(?:%[^\n]*)/i,/^(?:scale\s+)/i,/^(?:\d+)/i,/^(?:\s+width\b)/i,/^(?:accTitle\s*:\s*)/i,/^(?:(?!\n||)*[^\n]*)/i,/^(?:accDescr\s*:\s*)/i,/^(?:(?!\n||)*[^\n]*)/i,/^(?:accDescr\s*\{\s*)/i,/^(?:[\}])/i,/^(?:[^\}]*)/i,/^(?:classDef\s+)/i,/^(?:DEFAULT\s+)/i,/^(?:\w+\s+)/i,/^(?:[^\n]*)/i,/^(?:class\s+)/i,/^(?:(\w+)+((,\s*\w+)*))/i,/^(?:[^\n]*)/i,/^(?:style\s+)/i,/^(?:[\w,]+\s+)/i,/^(?:[^\n]*)/i,/^(?:scale\s+)/i,/^(?:\d+)/i,/^(?:\s+width\b)/i,/^(?:state\s+)/i,/^(?:.*<<fork>>)/i,/^(?:.*<<join>>)/i,/^(?:.*<<choice>>)/i,/^(?:.*\[\[fork\]\])/i,/^(?:.*\[\[join\]\])/i,/^(?:.*\[\[choice\]\])/i,/^(?:.*direction\s+TB[^\n]*)/i,/^(?:.*direction\s+BT[^\n]*)/i,/^(?:.*direction\s+RL[^\n]*)/i,/^(?:.*direction\s+LR[^\n]*)/i,/^(?:["])/i,/^(?:\s*as\s+)/i,/^(?:[^\n\{]*)/i,/^(?:["])/i,/^(?:[^"]*)/i,/^(?:[^\n\s\{]+)/i,/^(?:\n)/i,/^(?:\{)/i,/^(?:%%(?!\{)[^\n]*)/i,/^(?:\})/i,/^(?:[\n])/i,/^(?:note\s+)/i,/^(?:left of\b)/i,/^(?:right of\b)/i,/^(?:")/i,/^(?:\s*as\s*)/i,/^(?:["])/i,/^(?:[^"]*)/i,/^(?:[^\n]*)/i,/^(?:\s*[^:\n\s\-]+)/i,/^(?:\s*:[^:\n;]+)/i,/^(?:[\s\S]*?end note\b)/i,/^(?:stateDiagram\s+)/i,/^(?:stateDiagram-v2\s+)/i,/^(?:hide empty description\b)/i,/^(?:\[\*\])/i,/^(?:[^:\n\s\-\{]+)/i,/^(?:\s*:[^:\n;]+)/i,/^(?:-->)/i,/^(?:--)/i,/^(?::::)/i,/^(?:$)/i,/^(?:.)/i],conditions:{LINE:{rules:[9,10],inclusive:!1},struct:{rules:[9,10,22,26,29,35,42,43,44,45,54,55,56,57,71,72,73,74,75],inclusive:!1},FLOATING_NOTE_ID:{rules:[64],inclusive:!1},FLOATING_NOTE:{rules:[61,62,63],inclusive:!1},NOTE_TEXT:{rules:[66,67],inclusive:!1},NOTE_ID:{rules:[65],inclusive:!1},NOTE:{rules:[58,59,60],inclusive:!1},STYLEDEF_STYLEOPTS:{rules:[],inclusive:!1},STYLEDEF_STYLES:{rules:[31],inclusive:!1},STYLE_IDS:{rules:[],inclusive:!1},STYLE:{rules:[30],inclusive:!1},CLASS_STYLE:{rules:[28],inclusive:!1},CLASS:{rules:[27],inclusive:!1},CLASSDEFID:{rules:[25],inclusive:!1},CLASSDEF:{rules:[23,24],inclusive:!1},acc_descr_multiline:{rules:[20,21],inclusive:!1},acc_descr:{rules:[18],inclusive:!1},acc_title:{rules:[16],inclusive:!1},SCALE:{rules:[13,14,33,34],inclusive:!1},ALIAS:{rules:[],inclusive:!1},STATE_ID:{rules:[48],inclusive:!1},STATE_STRING:{rules:[49,50],inclusive:!1},FORK_STATE:{rules:[],inclusive:!1},STATE:{rules:[9,10,36,37,38,39,40,41,46,47,51,52,53],inclusive:!1},ID:{rules:[9,10],inclusive:!1},INITIAL:{rules:[0,1,2,3,4,5,6,7,8,10,11,12,15,17,19,22,26,29,32,35,53,57,68,69,70,71,72,73,74,76,77,78],inclusive:!0}}};return $}();St.lexer=ee;function nt(){this.yy={}}return h(nt,"Parser"),nt.prototype=St,St.Parser=nt,new nt}();vt.parser=vt;var We=vt,_e="TB",Mt="TB",Rt="dir",dt="state",Dt="relation",Te="classDef",Ee="style",me="applyClass",Q="default",Ut="divider",jt="fill:none",Ht="fill: #333",zt="c",Wt="text",Xt="normal",mt="rect",bt="rectWithTitle",be="stateStart",ve="stateEnd",Ot="divider",Nt="roundedWithTitle",De="note",ke="noteGroup",Z="statediagram",Ce="state",xe=`${Z}-${Ce}`,Kt="transition",Ae="note",Le="note-edge",Ie=`${Kt} ${Le}`,Re=`${Z}-${Ae}`,Oe="cluster",Ne=`${Z}-${Oe}`,we="cluster-alt",$e=`${Z}-${we}`,Jt="parent",qt="note",Pe="state",xt="----",Be=`${xt}${qt}`,wt=`${xt}${Jt}`,Qt=h((t,e=Mt)=>{if(!t.doc)return e;let n=e;for(const r of t.doc)r.stmt==="dir"&&(n=r.value);return n},"getDir"),Ge=h(function(t,e){return e.db.getClasses()},"getClasses"),Fe=h(async function(t,e,n,r){b.info("REF0:"),b.info("Drawing state diagram (v2)",e);const{securityLevel:u,state:i,layout:p}=A();r.db.extract(r.db.getRootDocV2());const _=r.db.getData(),d=re(e,u);_.type=r.type,_.layoutAlgorithm=p,_.nodeSpacing=(i==null?void 0:i.nodeSpacing)||50,_.rankSpacing=(i==null?void 0:i.rankSpacing)||50,_.markers=["barb"],_.diagramId=e,await ne(_,d);const E=8;le.insertTitle(d,"statediagramTitleText",(i==null?void 0:i.titleTopMargin)??25,r.db.getDiagramTitle()),ae(d,E,Z,(i==null?void 0:i.useMaxWidth)??!0)},"draw"),Xe={getClasses:Ge,draw:Fe,getDir:Qt},ft=new Map,P=0;function pt(t="",e=0,n="",r=xt){const u=n!==null&&n.length>0?`${r}${n}`:"";return`${Pe}-${t}${u}-${e}`}h(pt,"stateDomId");var Ye=h((t,e,n,r,u,i,p,_)=>{b.trace("items",e),e.forEach(d=>{switch(d.stmt){case dt:q(t,d,n,r,u,i,p,_);break;case Q:q(t,d,n,r,u,i,p,_);break;case Dt:{q(t,d.state1,n,r,u,i,p,_),q(t,d.state2,n,r,u,i,p,_);const E={id:"edge"+P,start:d.state1.id,end:d.state2.id,arrowhead:"normal",arrowTypeEnd:"arrow_barb",style:jt,labelStyle:"",label:U.sanitizeText(d.description,A()),arrowheadStyle:Ht,labelpos:zt,labelType:Wt,thickness:Xt,classes:Kt,look:p};u.push(E),P++}break}})},"setupDoc"),$t=h((t,e=Mt)=>{let n=e;if(t.doc)for(const r of t.doc)r.stmt==="dir"&&(n=r.value);return n},"getDir");function J(t,e,n){if(!e.id||e.id==="</join></fork>"||e.id==="</choice>")return;e.cssClasses&&(Array.isArray(e.cssCompiledStyles)||(e.cssCompiledStyles=[]),e.cssClasses.split(" ").forEach(u=>{if(n.get(u)){const i=n.get(u);e.cssCompiledStyles=[...e.cssCompiledStyles,...i.styles]}}));const r=t.find(u=>u.id===e.id);r?Object.assign(r,e):t.push(e)}h(J,"insertOrUpdateNode");function Zt(t){var e;return((e=t==null?void 0:t.classes)==null?void 0:e.join(" "))??""}h(Zt,"getClassesFromDbInfo");function te(t){return(t==null?void 0:t.styles)??[]}h(te,"getStylesFromDbInfo");var q=h((t,e,n,r,u,i,p,_)=>{var d,E;const S=e.id,C=n.get(S),j=Zt(C),B=te(C);if(b.info("dataFetcher parsedItem",e,C,B),S!=="root"){let I=mt;e.start===!0?I=be:e.start===!1&&(I=ve),e.type!==Q&&(I=e.type),ft.get(S)||ft.set(S,{id:S,shape:I,description:U.sanitizeText(S,A()),cssClasses:`${j} ${xe}`,cssStyles:B});const f=ft.get(S);e.description&&(Array.isArray(f.description)?(f.shape=bt,f.description.push(e.description)):((d=f.description)==null?void 0:d.length)>0?(f.shape=bt,f.description===S?f.description=[e.description]:f.description=[f.description,e.description]):(f.shape=mt,f.description=e.description),f.description=U.sanitizeTextOrArray(f.description,A())),((E=f.description)==null?void 0:E.length)===1&&f.shape===bt&&(f.type==="group"?f.shape=Nt:f.shape=mt),!f.type&&e.doc&&(b.info("Setting cluster for XCX",S,$t(e)),f.type="group",f.isGroup=!0,f.dir=$t(e),f.shape=e.type===Ut?Ot:Nt,f.cssClasses=`${f.cssClasses} ${Ne} ${i?$e:""}`);const L={labelStyle:"",shape:f.shape,label:f.description,cssClasses:f.cssClasses,cssCompiledStyles:[],cssStyles:f.cssStyles,id:S,dir:f.dir,domId:pt(S,P),type:f.type,isGroup:f.type==="group",padding:8,rx:10,ry:10,look:p};if(L.shape===Ot&&(L.label=""),t&&t.id!=="root"&&(b.trace("Setting node ",S," to be child of its parent ",t.id),L.parentId=t.id),L.centerLabel=!0,e.note){const R={labelStyle:"",shape:De,label:e.note.text,cssClasses:Re,cssStyles:[],cssCompilesStyles:[],id:S+Be+"-"+P,domId:pt(S,P,qt),type:f.type,isGroup:f.type==="group",padding:A().flowchart.padding,look:p,position:e.note.position},G=S+wt,F={labelStyle:"",shape:ke,label:e.note.text,cssClasses:f.cssClasses,cssStyles:[],id:S+wt,domId:pt(S,P,Jt),type:"group",isGroup:!0,padding:16,look:p,position:e.note.position};P++,F.id=G,R.parentId=G,J(r,F,_),J(r,R,_),J(r,L,_);let N=S,w=R.id;e.note.position==="left of"&&(N=R.id,w=S),u.push({id:N+"-"+w,start:N,end:w,arrowhead:"none",arrowTypeEnd:"",style:jt,labelStyle:"",classes:Ie,arrowheadStyle:Ht,labelpos:zt,labelType:Wt,thickness:Xt,look:p})}else J(r,L,_)}e.doc&&(b.trace("Adding nodes children "),Ye(e,e.doc,n,r,u,!i,p,_))},"dataFetcher"),Ve=h(()=>{ft.clear(),P=0},"reset"),kt="[*]",Pt="start",Bt=kt,Gt="end",Ft="color",Yt="fill",Me="bgFill",Ue=",";function Ct(){return new Map}h(Ct,"newClassesList");var Vt=h(()=>({relations:[],states:new Map,documents:{}}),"newDoc"),ut=h(t=>JSON.parse(JSON.stringify(t)),"clone"),Ke=(ht=class{constructor(t){v(this,"version"),v(this,"nodes",[]),v(this,"edges",[]),v(this,"rootDoc",[]),v(this,"classes",Ct()),v(this,"documents",{root:Vt()}),v(this,"currentDocument",this.documents.root),v(this,"startEndCount",0),v(this,"dividerCnt",0),v(this,"getAccTitle",he),v(this,"setAccTitle",ue),v(this,"getAccDescription",de),v(this,"setAccDescription",fe),v(this,"setDiagramTitle",pe),v(this,"getDiagramTitle",Se),this.clear(),this.version=t,this.setRootDoc=this.setRootDoc.bind(this),this.getDividerId=this.getDividerId.bind(this),this.setDirection=this.setDirection.bind(this),this.trimColon=this.trimColon.bind(this)}setRootDoc(t){b.info("Setting root doc",t),this.rootDoc=t,this.version===1?this.extract(t):this.extract(this.getRootDocV2())}getRootDoc(){return this.rootDoc}docTranslator(t,e,n){if(e.stmt===Dt)this.docTranslator(t,e.state1,!0),this.docTranslator(t,e.state2,!1);else if(e.stmt===dt&&(e.id==="[*]"?(e.id=n?t.id+"_start":t.id+"_end",e.start=n):e.id=e.id.trim()),e.doc){const r=[];let u=[],i;for(i=0;i<e.doc.length;i++)if(e.doc[i].type===Ut){const p=ut(e.doc[i]);p.doc=ut(u),r.push(p),u=[]}else u.push(e.doc[i]);if(r.length>0&&u.length>0){const p={stmt:dt,id:oe(),type:"divider",doc:ut(u)};r.push(ut(p)),e.doc=r}e.doc.forEach(p=>this.docTranslator(e,p,!0))}}getRootDocV2(){return this.docTranslator({id:"root"},{id:"root",doc:this.rootDoc},!0),{id:"root",doc:this.rootDoc}}extract(t){let e;t.doc?e=t.doc:e=t,b.info(e),this.clear(!0),b.info("Extract initial document:",e),e.forEach(i=>{switch(b.warn("Statement",i.stmt),i.stmt){case dt:this.addState(i.id.trim(),i.type,i.doc,i.description,i.note,i.classes,i.styles,i.textStyles);break;case Dt:this.addRelation(i.state1,i.state2,i.description);break;case Te:this.addStyleClass(i.id.trim(),i.classes);break;case Ee:{const p=i.id.trim().split(","),_=i.styleClass.split(",");p.forEach(d=>{let E=this.getState(d);if(E===void 0){const S=d.trim();this.addState(S),E=this.getState(S)}E.styles=_.map(S=>{var C;return(C=S.replace(/;/g,""))==null?void 0:C.trim()})})}break;case me:this.setCssClass(i.id.trim(),i.styleClass);break}});const n=this.getStates(),u=A().look;Ve(),q(void 0,this.getRootDocV2(),n,this.nodes,this.edges,!0,u,this.classes),this.nodes.forEach(i=>{if(Array.isArray(i.label)){if(i.description=i.label.slice(1),i.isGroup&&i.description.length>0)throw new Error("Group nodes can only have label. Remove the additional description for node ["+i.id+"]");i.label=i.label[0]}})}addState(t,e=Q,n=null,r=null,u=null,i=null,p=null,_=null){const d=t==null?void 0:t.trim();if(this.currentDocument.states.has(d)?(this.currentDocument.states.get(d).doc||(this.currentDocument.states.get(d).doc=n),this.currentDocument.states.get(d).type||(this.currentDocument.states.get(d).type=e)):(b.info("Adding state ",d,r),this.currentDocument.states.set(d,{id:d,descriptions:[],type:e,doc:n,note:u,classes:[],styles:[],textStyles:[]})),r&&(b.info("Setting state description",d,r),typeof r=="string"&&this.addDescription(d,r.trim()),typeof r=="object"&&r.forEach(E=>this.addDescription(d,E.trim()))),u){const E=this.currentDocument.states.get(d);E.note=u,E.note.text=U.sanitizeText(E.note.text,A())}i&&(b.info("Setting state classes",d,i),(typeof i=="string"?[i]:i).forEach(S=>this.setCssClass(d,S.trim()))),p&&(b.info("Setting state styles",d,p),(typeof p=="string"?[p]:p).forEach(S=>this.setStyle(d,S.trim()))),_&&(b.info("Setting state styles",d,p),(typeof _=="string"?[_]:_).forEach(S=>this.setTextStyle(d,S.trim())))}clear(t){this.nodes=[],this.edges=[],this.documents={root:Vt()},this.currentDocument=this.documents.root,this.startEndCount=0,this.classes=Ct(),t||ce()}getState(t){return this.currentDocument.states.get(t)}getStates(){return this.currentDocument.states}logDocuments(){b.info("Documents = ",this.documents)}getRelations(){return this.currentDocument.relations}startIdIfNeeded(t=""){let e=t;return t===kt&&(this.startEndCount++,e=`${Pt}${this.startEndCount}`),e}startTypeIfNeeded(t="",e=Q){return t===kt?Pt:e}endIdIfNeeded(t=""){let e=t;return t===Bt&&(this.startEndCount++,e=`${Gt}${this.startEndCount}`),e}endTypeIfNeeded(t="",e=Q){return t===Bt?Gt:e}addRelationObjs(t,e,n){let r=this.startIdIfNeeded(t.id.trim()),u=this.startTypeIfNeeded(t.id.trim(),t.type),i=this.startIdIfNeeded(e.id.trim()),p=this.startTypeIfNeeded(e.id.trim(),e.type);this.addState(r,u,t.doc,t.description,t.note,t.classes,t.styles,t.textStyles),this.addState(i,p,e.doc,e.description,e.note,e.classes,e.styles,e.textStyles),this.currentDocument.relations.push({id1:r,id2:i,relationTitle:U.sanitizeText(n,A())})}addRelation(t,e,n){if(typeof t=="object")this.addRelationObjs(t,e,n);else{const r=this.startIdIfNeeded(t.trim()),u=this.startTypeIfNeeded(t),i=this.endIdIfNeeded(e.trim()),p=this.endTypeIfNeeded(e);this.addState(r,u),this.addState(i,p),this.currentDocument.relations.push({id1:r,id2:i,title:U.sanitizeText(n,A())})}}addDescription(t,e){const n=this.currentDocument.states.get(t),r=e.startsWith(":")?e.replace(":","").trim():e;n.descriptions.push(U.sanitizeText(r,A()))}cleanupLabel(t){return t.substring(0,1)===":"?t.substr(2).trim():t.trim()}getDividerId(){return this.dividerCnt++,"divider-id-"+this.dividerCnt}addStyleClass(t,e=""){this.classes.has(t)||this.classes.set(t,{id:t,styles:[],textStyles:[]});const n=this.classes.get(t);e!=null&&e.split(Ue).forEach(r=>{const u=r.replace(/([^;]*);/,"$1").trim();if(RegExp(Ft).exec(r)){const p=u.replace(Yt,Me).replace(Ft,Yt);n.textStyles.push(p)}n.styles.push(u)})}getClasses(){return this.classes}setCssClass(t,e){t.split(",").forEach(n=>{let r=this.getState(n);if(r===void 0){const u=n.trim();this.addState(u),r=this.getState(u)}r.classes.push(e)})}setStyle(t,e){const n=this.getState(t);n!==void 0&&n.styles.push(e)}setTextStyle(t,e){const n=this.getState(t);n!==void 0&&n.textStyles.push(e)}getDirectionStatement(){return this.rootDoc.find(t=>t.stmt===Rt)}getDirection(){var t;return((t=this.getDirectionStatement())==null?void 0:t.value)??_e}setDirection(t){const e=this.getDirectionStatement();e?e.value=t:this.rootDoc.unshift({stmt:Rt,value:t})}trimColon(t){return t&&t[0]===":"?t.substr(1).trim():t.trim()}getData(){const t=A();return{nodes:this.nodes,edges:this.edges,other:{},config:t,direction:Qt(this.getRootDocV2())}}getConfig(){return A().state}},h(ht,"StateDB"),v(ht,"relationType",{AGGREGATION:0,EXTENSION:1,COMPOSITION:2,DEPENDENCY:3}),ht),je=h(t=>`
defs #statediagram-barbEnd {
    fill: ${t.transitionColor};
    stroke: ${t.transitionColor};
  }
g.stateGroup text {
  fill: ${t.nodeBorder};
  stroke: none;
  font-size: 10px;
}
g.stateGroup text {
  fill: ${t.textColor};
  stroke: none;
  font-size: 10px;

}
g.stateGroup .state-title {
  font-weight: bolder;
  fill: ${t.stateLabelColor};
}

g.stateGroup rect {
  fill: ${t.mainBkg};
  stroke: ${t.nodeBorder};
}

g.stateGroup line {
  stroke: ${t.lineColor};
  stroke-width: 1;
}

.transition {
  stroke: ${t.transitionColor};
  stroke-width: 1;
  fill: none;
}

.stateGroup .composit {
  fill: ${t.background};
  border-bottom: 1px
}

.stateGroup .alt-composit {
  fill: #e0e0e0;
  border-bottom: 1px
}

.state-note {
  stroke: ${t.noteBorderColor};
  fill: ${t.noteBkgColor};

  text {
    fill: ${t.noteTextColor};
    stroke: none;
    font-size: 10px;
  }
}

.stateLabel .box {
  stroke: none;
  stroke-width: 0;
  fill: ${t.mainBkg};
  opacity: 0.5;
}

.edgeLabel .label rect {
  fill: ${t.labelBackgroundColor};
  opacity: 0.5;
}
.edgeLabel {
  background-color: ${t.edgeLabelBackground};
  p {
    background-color: ${t.edgeLabelBackground};
  }
  rect {
    opacity: 0.5;
    background-color: ${t.edgeLabelBackground};
    fill: ${t.edgeLabelBackground};
  }
  text-align: center;
}
.edgeLabel .label text {
  fill: ${t.transitionLabelColor||t.tertiaryTextColor};
}
.label div .edgeLabel {
  color: ${t.transitionLabelColor||t.tertiaryTextColor};
}

.stateLabel text {
  fill: ${t.stateLabelColor};
  font-size: 10px;
  font-weight: bold;
}

.node circle.state-start {
  fill: ${t.specialStateColor};
  stroke: ${t.specialStateColor};
}

.node .fork-join {
  fill: ${t.specialStateColor};
  stroke: ${t.specialStateColor};
}

.node circle.state-end {
  fill: ${t.innerEndBackground};
  stroke: ${t.background};
  stroke-width: 1.5
}
.end-state-inner {
  fill: ${t.compositeBackground||t.background};
  // stroke: ${t.background};
  stroke-width: 1.5
}

.node rect {
  fill: ${t.stateBkg||t.mainBkg};
  stroke: ${t.stateBorder||t.nodeBorder};
  stroke-width: 1px;
}
.node polygon {
  fill: ${t.mainBkg};
  stroke: ${t.stateBorder||t.nodeBorder};;
  stroke-width: 1px;
}
#statediagram-barbEnd {
  fill: ${t.lineColor};
}

.statediagram-cluster rect {
  fill: ${t.compositeTitleBackground};
  stroke: ${t.stateBorder||t.nodeBorder};
  stroke-width: 1px;
}

.cluster-label, .nodeLabel {
  color: ${t.stateLabelColor};
  // line-height: 1;
}

.statediagram-cluster rect.outer {
  rx: 5px;
  ry: 5px;
}
.statediagram-state .divider {
  stroke: ${t.stateBorder||t.nodeBorder};
}

.statediagram-state .title-state {
  rx: 5px;
  ry: 5px;
}
.statediagram-cluster.statediagram-cluster .inner {
  fill: ${t.compositeBackground||t.background};
}
.statediagram-cluster.statediagram-cluster-alt .inner {
  fill: ${t.altBackground?t.altBackground:"#efefef"};
}

.statediagram-cluster .inner {
  rx:0;
  ry:0;
}

.statediagram-state rect.basic {
  rx: 5px;
  ry: 5px;
}
.statediagram-state rect.divider {
  stroke-dasharray: 10,10;
  fill: ${t.altBackground?t.altBackground:"#efefef"};
}

.note-edge {
  stroke-dasharray: 5;
}

.statediagram-note rect {
  fill: ${t.noteBkgColor};
  stroke: ${t.noteBorderColor};
  stroke-width: 1px;
  rx: 0;
  ry: 0;
}
.statediagram-note rect {
  fill: ${t.noteBkgColor};
  stroke: ${t.noteBorderColor};
  stroke-width: 1px;
  rx: 0;
  ry: 0;
}

.statediagram-note text {
  fill: ${t.noteTextColor};
}

.statediagram-note .nodeLabel {
  color: ${t.noteTextColor};
}
.statediagram .edgeLabel {
  color: red; // ${t.noteTextColor};
}

#dependencyStart, #dependencyEnd {
  fill: ${t.lineColor};
  stroke: ${t.lineColor};
  stroke-width: 1;
}

.statediagramTitleText {
  text-anchor: middle;
  font-size: 18px;
  fill: ${t.textColor};
}
`,"getStyles"),Je=je;export{Ke as S,We as a,Xe as b,Je as s};
