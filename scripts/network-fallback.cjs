const os=require('node:os');
const original=os.networkInterfaces;
os.networkInterfaces=function(){try{return original()}catch{return {lo:[{address:'127.0.0.1',family:'IPv4',internal:true,netmask:'255.0.0.0',cidr:'127.0.0.1/8'}]}}};
