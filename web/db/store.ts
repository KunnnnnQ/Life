import { MIGRATIONS } from "./migrations.ts";

export class Store {
  db:D1Database;
  constructor(db:D1Database){this.db=db;}
  async init(){await this.db.batch(MIGRATIONS.map(sql=>this.db.prepare(sql)));}
  async ownerExists(owner:string){return !!await this.db.prepare("SELECT id FROM owners WHERE id=?").bind(owner).first();}
  async createOwner(owner:string){await this.db.prepare("INSERT INTO owners(id,created_at) VALUES (?,?)").bind(owner,new Date().toISOString()).run();}
  async get<T>(owner:string,kind:string,id:string):Promise<T|null>{
    const row=await this.db.prepare("SELECT body FROM records WHERE owner=? AND kind=? AND id=?").bind(owner,kind,id).first<{body:string}>();
    return row?JSON.parse(row.body):null;
  }
  async list<T>(owner:string,kind:string):Promise<T[]>{
    const rows=await this.db.prepare("SELECT body FROM records WHERE owner=? AND kind=? ORDER BY updated_at DESC").bind(owner,kind).all<{body:string}>();
    return rows.results.map(r=>JSON.parse(r.body));
  }
  statement(owner:string,kind:string,id:string,value:unknown,insertOnly=false){
    return this.db.prepare(`INSERT ${insertOnly?"":"OR REPLACE "}INTO records(owner,kind,id,body,updated_at) VALUES(?,?,?,?,?)`)
      .bind(owner,kind,id,JSON.stringify(value),new Date().toISOString());
  }
  async put(owner:string,kind:string,id:string,value:unknown){await this.statement(owner,kind,id,value).run();}
  async remove(owner:string,kind:string,id:string){await this.db.prepare("DELETE FROM records WHERE owner=? AND kind=? AND id=?").bind(owner,kind,id).run();}
  async forget(owner:string){await this.db.batch([
    this.db.prepare("DELETE FROM records WHERE owner=?").bind(owner),
    this.db.prepare("DELETE FROM jobs WHERE owner=?").bind(owner),
    this.db.prepare("DELETE FROM requests WHERE owner=?").bind(owner),
    this.db.prepare("DELETE FROM owners WHERE id=?").bind(owner),
  ]);}
  async claim(owner:string,id:string,now=Date.now()){
    return await this.db.prepare(`UPDATE jobs SET status='running',attempts=attempts+1,lease_until=?,error=NULL
      WHERE owner=? AND session_id=? AND attempts<3 AND
      (status IN ('queued','failed') OR (status='running' AND lease_until<?)) RETURNING attempts`)
      .bind(now+90000,owner,id,now).first();
  }
  async job(owner:string,id:string){return this.db.prepare("SELECT status,attempts,lease_until,error FROM jobs WHERE owner=? AND session_id=?").bind(owner,id).first();}
}
