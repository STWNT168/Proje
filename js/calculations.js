/* PMV VALIDATION V4 - opening-balance based closing calculation */
(()=>{
  const $=id=>document.getElementById(id);
  const n=id=>Math.max(0,Math.floor(Number($(id)?.value||0)));

  function calc(){
    const openingK=Number($('openK')?.textContent||0);
    const openingA=Number($('openA')?.textContent||0);

    const cameK=n('newKits'), cameA=n('newArticles');
    const deliveredK=n('deliveredKits'), deliveredA=n('deliveredArticles');
    const redirectK=n('redirectedKits'), redirectA=n('redirectedArticles');
    const returnK=n('rtsKits'), returnA=n('rtsArticles');

    // Available stock = Opening + Came Today.
    // If Came Today is 0, movement is deducted directly from Opening.
    const availableK=openingK+cameK;
    const availableA=openingA+cameA;

    const movementK=deliveredK+redirectK+returnK;
    const movementA=deliveredA+redirectA+returnA;

    const closeK=availableK-movementK;
    const closeA=availableA-movementA;

    // Remaining classification must equal the calculated closing balance.
    const partsK=n('invalidKits')+n('tornKits')+n('deliverableKits')+n('incompleteKits');
    const partsA=n('invalidArticles')+n('tornArticles')+n('deliverableArticles')+n('incompleteArticles');

    return {
      openingK,openingA,cameK,cameA,
      deliveredK,deliveredA,redirectK,redirectA,returnK,returnA,
      availableK,availableA,movementK,movementA,
      closeK,closeA,partsK,partsA,
      stockOkK: movementK<=availableK,
      stockOkA: movementA<=availableA,
      classificationOkK: closeK===partsK,
      classificationOkA: closeA===partsA,
      cameZeroK: cameK===0,
      cameZeroA: cameA===0
    };
  }

  function render(){
    const c=calc();
    if($('closeK')) $('closeK').textContent=c.closeK;
    if($('closeA')) $('closeA').textContent=c.closeA;

    const v=$('validation');
    if(!v) return c;

    const stockOk=c.stockOkK&&c.stockOkA;
    const classificationOk=c.classificationOkK&&c.classificationOkA;
    const good=stockOk&&classificationOk;

    v.className='validation '+(good?'ok':'bad');

    if(good){
      v.innerHTML=`<b>✓ Validation passed</b>
        <span>Kits Closing: ${c.openingK} + ${c.cameK} − ${c.deliveredK} − ${c.redirectK} − ${c.returnK} = <b>${c.closeK}</b>; Classification = ${c.partsK}</span>
        <span>Articles Closing: ${c.openingA} + ${c.cameA} − ${c.deliveredA} − ${c.redirectA} − ${c.returnA} = <b>${c.closeA}</b>; Classification = ${c.partsA}</span>`;
    } else if(!stockOk){
      v.innerHTML=`<b>Validation failed</b>
        <span>${!c.stockOkK?'Kits: Delivered + Redirected + Return/RTS cannot exceed Opening + Came Today.':''}</span>
        <span>${!c.stockOkA?'Articles: Delivered + Redirected + Return/RTS cannot exceed Opening + Came Today.':''}</span>`;
    } else {
      v.innerHTML=`<b>Validation failed</b>
        <span>Kits Closing Balance: <b>${c.closeK}</b> | Classification Total: <b>${c.partsK}</b></span>
        <span>Articles Closing Balance: <b>${c.closeA}</b> | Classification Total: <b>${c.partsA}</b></span>`;
    }
    return c;
  }

  window.PMVCalc={n,calc,render};
})();
