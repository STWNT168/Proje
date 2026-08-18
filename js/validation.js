function validateForm(show=true){
  const c=updateClosing();
  const msgs=[];
  if(c.closeK<0)msgs.push("Kit movement exceeds available stock.");
  if(c.closeA<0)msgs.push("Article movement exceeds available stock.");
  if(c.closeK!==c.partsK)msgs.push(`Kit mismatch: closing ${c.closeK} ≠ category total ${c.partsK}.`);
  if(c.closeA!==c.partsA)msgs.push(`Article mismatch: closing ${c.closeA} ≠ category total ${c.partsA}.`);
  const el=document.getElementById("validation");
  if(msgs.length){el.className="validation-card bad";el.innerHTML="<b>Validation failed</b><br>"+msgs.join("<br>");return false}
  el.className="validation-card ok";el.innerHTML="<b>Validation passed</b><br>Kits closing = "+c.closeK+" and Articles closing = "+c.closeA+".";
  return true;
}
