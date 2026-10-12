// Category-based themes do not assert indoor access or suitability for children.
export function themeFor(facility){
 const category=facility.category;
 if(['美術館','博物館'].includes(category))return {id:'museum',label:'美術館・博物館めぐり'};
 if(category==='科学館')return {id:'science',label:'科学を楽しむ'};
 if(['庭園','動物園','植物園'].includes(category))return {id:'outdoor',label:'屋外のお出かけ'};
 return {id:'area',label:'無料スポットめぐり'};
}
