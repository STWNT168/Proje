/* PMV VALIDATION V4 - classification is validated against calculated closing balance */
window.PMVValidation={
  validate:()=>{
    const c=PMVCalc.render();
    const stockOk=c.stockOkK&&c.stockOkA;
    const classificationOk=c.classificationOkK&&c.classificationOkA;
    const valid=stockOk&&classificationOk;

    let message='Validation passed.';
    if(!stockOk){
      const parts=[];
      if(!c.stockOkK) parts.push('Kits movement exceeds Opening + Came Today.');
      if(!c.stockOkA) parts.push('Articles movement exceeds Opening + Came Today.');
      message=parts.join(' ');
    }else if(!classificationOk){
      const parts=[];
      if(!c.classificationOkK) parts.push(`Kits remaining classification must equal closing balance ${c.closeK}.`);
      if(!c.classificationOkA) parts.push(`Articles remaining classification must equal closing balance ${c.closeA}.`);
      message=parts.join(' ');
    }
    return {valid,message};
  }
};
