/** Actual route objects + memory router; not browser history or the full application. */
import React from "react";
import { createRoot } from "react-dom/client";
import { createRootRoute, createRouter, createMemoryHistory, RouterProvider, Outlet } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route as Overview } from "@/routes/campaigns.imported.$id.index";
import { Route as Chapter } from "@/routes/campaigns.imported.$id.chapter.$chapter";
import { setActiveOwnerInternal } from "@/lib/identity/owner";
import { installIdentityPartition, isPersonalKey } from "@/lib/identity/partition";
import { recordActivity, getCampaignProgress } from "@/lib/importedCampaignProgress";
import { campaign as baseCampaign, profile, metrics, snapshot, syntheticFeed } from "./completed-reread-boundary";
import "@/styles.css";
const rootRoute = createRootRoute({ component: Outlet });
const overview = Overview.update({getParentRoute:()=>rootRoute,path:"/campaigns/imported/$id/"} as any);
const chapter = Chapter.update({getParentRoute:()=>rootRoute,path:"/campaigns/imported/$id/chapter/$chapter"} as any);
let started = false;
Object.assign(window, { completedReread: {
  metrics, snapshot,
  async start(mode: "review"|"forged"|"normal"|"active"|"art") {
    if (started) throw Error("one scenario per page");
    started = true;
    // Exact image binding identity, but deliberately synthetic activity/reading content.
    const campaign = mode === "art" ? {...baseCampaign, id:"cordoba-golden-age", title:"قرطبة — بيانات اختبار",
      chapters:baseCampaign.chapters.map((ch,index)=>index===0?{...ch,id:"ch5",title:"مدينة الكتب",imageUrl:null}:ch)} : baseCampaign;
    setActiveOwnerInternal("user:synthetic-reread"); installIdentityPartition();
    profile.hearts = mode === "active" || mode === "normal" || mode === "art" ? 5 : 0;
    if (mode === "review" || mode === "normal") recordActivity(campaign,campaign.chapters[0],campaign.chapters[0].activities[0],true);
    const progress=getCampaignProgress(campaign.id);
    if(mode === "review" || mode === "normal") {
      const completed=progress.chapters.one;
      if(!completed?.completed || completed.completedActivityIds.length!==1 || completed.completedActivityIds[0]!=="answer-one" || progress.completed || Object.keys(snapshot()).length===0)
        throw Error("partial seed evidence missing");
      // recordActivity only schedules its completion import if the entire campaign completes.
    } else if(progress.completed || Object.values(progress.chapters).some(ch=>ch.completed || ch.completedActivityIds.length)) {
      throw Error("fresh incomplete seed required");
    }
    if((metrics.unexpected??0)!==0) throw Error("unexpected setup action");
    for (const k of Object.keys(metrics)) delete metrics[k];
    const before = snapshot();
    const personal=(key:string)=>isPersonalKey(key)||key.includes("::owner=");
    const originalSet=Storage.prototype.setItem;
    const originalRemove=Storage.prototype.removeItem;
    const originalClear=Storage.prototype.clear;
    Storage.prototype.setItem=function(key,value) {
      if(this===localStorage && personal(key)) metrics.storage=(metrics.storage??0)+1;
      return originalSet.call(this,key,value);
    };
    Storage.prototype.removeItem=function(key) {
      if(this===localStorage && personal(key)) metrics.storage=(metrics.storage??0)+1;
      return originalRemove.call(this,key);
    };
    Storage.prototype.clear=function() {
      if(this===localStorage && Object.keys(localStorage).some(personal)) metrics.storage=(metrics.storage??0)+1;
      return originalClear.call(this);
    };
    const href = mode === "art" ? "/campaigns/imported/cordoba-golden-age/chapter/ch5" : mode === "review" ? "/campaigns/imported/synthetic-reread/" :
      "/campaigns/imported/synthetic-reread/chapter/one"+(mode === "forged" ? "?review=chapter" : "");
    const history=createMemoryHistory({initialEntries:[href]});
    const router=createRouter({routeTree:rootRoute.addChildren([overview,chapter]),history,defaultPreload:false});
    const query=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
    query.setQueryData(["campaign",campaign.id,"published"],campaign);
    query.setQueryData(["campaigns","feed"],syntheticFeed(campaign));
    Object.assign((window as any).completedReread,{before, location:()=>router.state.location.href});
    createRoot(document.getElementById("app")!).render(<QueryClientProvider client={query}><RouterProvider router={router}/></QueryClientProvider>);
  }
}});
