using AnimeStudio.Endfield;
using AnimeStudio.Endfield.Processors;
using Newtonsoft.Json;
using System.Security.Cryptography;
using System.Buffers.Binary;
using Newtonsoft.Json.Linq;

byte[] ReadRange(string path, AnimeStudio.Endfield.FileInfo file, long offset, int length) {
    if(offset<0 || offset+length>file.Length)throw new InvalidDataException("Range outside VFS file");
    int pad=file.UseEncrypt?(int)(offset%64):0;
    byte[] bytes=new byte[length+pad];
    using var stream=File.OpenRead(path);stream.Position=file.Offset+offset-pad;stream.ReadExactly(bytes);
    if(file.UseEncrypt) {
        byte[] nonce=new byte[12];BinaryPrimitives.WriteInt32LittleEndian(nonce,Keys.VfsProtoVersion);
        BinaryPrimitives.WriteInt64LittleEndian(nonce.AsSpan(4),file.IvSeed);
        var cipher=new ChaCha20(Keys.ChaCha20Key,nonce,checked((uint)(offset/64)+1));cipher.ApplyKeystream(bytes);
    }
    return bytes.AsSpan(pad).ToArray();
}

string output = Path.GetFullPath(args[1]);
Directory.CreateDirectory(output);
if(args[0]=="unpackbanks") {
    string dest=Path.Combine(output,"bnk");Directory.CreateDirectory(dest);
    var banks=new List<object>();
    foreach(var file in Directory.GetFiles(output,"*.pck")) {
        var package=AkpkPackage.Parse(File.ReadAllBytes(file));
        foreach(var (start,end) in package.BnkRanges){
            byte[] bytes=package.RawData.AsSpan(start,end-start).ToArray();
            uint version=BinaryPrimitives.ReadUInt32LittleEndian(bytes.AsSpan(8));
            uint id=BinaryPrimitives.ReadUInt32LittleEndian(bytes.AsSpan(12));
            string target=Path.Combine(dest,id+".bnk");File.WriteAllBytes(target,bytes);
            banks.Add(new{id,version,pck=Path.GetFileName(file),file=target,bytes=bytes.Length,sha256=Convert.ToHexString(SHA256.HashData(bytes))});
        }
    }
    File.WriteAllText(Path.Combine(output,"bnk_sources.json"),JsonConvert.SerializeObject(banks,Formatting.Indented));
    Console.WriteLine($"Unpacked {banks.Count} banks");return;
}
var rows = new List<object>();
var seen = new HashSet<string>();
var preferred = new Dictionary<string,UInt128>();
var needed=args[0]=="media"?JObject.Parse(File.ReadAllText(args[2]))["events"]!.SelectMany(e=>e["sounds"]!).Select(s=>(uint)s["mediaId"]!).ToHashSet():new HashSet<uint>();
var found=new HashSet<uint>();
foreach(string layer in new[]{"Persistent","StreamingAssets"}) {
    var loader = new VfsLoader(Path.Combine(@"F:\Endfield Game\Endfield_Data",layer),Keys.ChaCha20Key);
    foreach(var block in args[0]=="skills"?new[]{BlockType.JsonData}:new[]{BlockType.InitialAudio,BlockType.Audio,BlockType.HotfixAudio}) {
        BlockMainInfo info;
        try { info = loader.LoadBlockInfo(block); } catch(FileNotFoundException){continue;} catch(DirectoryNotFoundException){continue;}
        foreach(var chunk in info.Chunks) foreach(var file in chunk.Files) {
            string name=file.FileName.Replace('\\','/').ToLowerInvariant();
            if(args[0]=="index") {rows.Add(new{layer,block=block.ToString(),name,bytes=file.Length});continue;}
            if(args[0]=="banks" && !name.EndsWith("banks.pck"))continue;
            if(args[0]=="file" && !name.EndsWith(args[2].ToLowerInvariant()))continue;
            if(args[0]=="skills" && !(name.Contains("/skilldata/")&&name.Contains("int_fac_battle_")))continue;
            if(args[0]=="media" && !name.Contains("stream"))continue;
            if(seen.Contains(name))continue;
            if(!preferred.TryAdd(name,file.FileDataMd5) && preferred[name]!=file.FileDataMd5)continue;
            if(args[0]=="media") {
                string physical=Path.Combine(loader.VfsPath,BlockHashes.GetDirName(block),chunk.FileName());
                if(!File.Exists(physical))continue;
                byte[] prefix=ReadRange(physical,file,0,12);
                int headerSize=checked((int)BinaryPrimitives.ReadUInt32LittleEndian(prefix.AsSpan(4)));
                if(headerSize<16 || headerSize>16*1024*1024)throw new InvalidDataException("Invalid PCK header");
                byte[] header=ReadRange(physical,file,0,headerSize+8);
                if(System.Text.Encoding.ASCII.GetString(header,0,4)==":)xD")AkpkCrypto.DecryptVfs(header,12,headerSize-4,(uint)headerSize,0);
                uint U32(int p)=>BinaryPrimitives.ReadUInt32LittleEndian(header.AsSpan(p));
                uint langSize=U32(12),bankSize=U32(16),soundSize=U32(20);
                bool external=langSize+bankSize+soundSize+16<headerSize;
                int sector=(external?28:24)+(int)langSize;
                var entries=new List<AkpkPackage.WemEntry>();
                foreach(uint sectorSize in new[]{bankSize,soundSize}) {
                    if(sectorSize>=4){uint count=U32(sector),width=count>0?(sectorSize-4)/count:20;
                        if(width!=20&&width!=24)throw new InvalidDataException("Unsupported PCK index");
                        for(int i=0;i<count;i++) {
                            int p=sector+4+i*(int)width;uint id=U32(p),blockSize=U32(p+4);
                            ulong size=width==24?BinaryPrimitives.ReadUInt64LittleEndian(header.AsSpan(p+8)):U32(p+8);
                            ulong offset=U32(p+(width==24?16:12))*(ulong)Math.Max(1,blockSize);
                            entries.Add(new AkpkPackage.WemEntry{Id=id,Size=size,Offset=offset});
                        }
                    }sector+=(int)sectorSize;
                }
                foreach(var entry in entries) {
                    uint id=checked((uint)entry.Id);if(!needed.Contains(id)||found.Contains(id))continue;
                    byte[] wem=ReadRange(physical,file,checked((long)entry.Offset),checked((int)entry.Size));
                    if(System.Text.Encoding.ASCII.GetString(wem,0,4)!="RIFF")AkpkCrypto.DecryptWem(wem,id);
                    if(System.Text.Encoding.ASCII.GetString(wem,0,4)!="RIFF")throw new InvalidDataException("Invalid decoded WEM");
                    string mediaDest=Path.Combine(output,id+".wem");File.WriteAllBytes(mediaDest,wem);found.Add(id);
                    rows.Add(new {id,layer,block=block.ToString(),name,info.Version,vfsEncrypted=file.UseEncrypt,
                        pckManifestMd5=file.FileDataMd5.ToString("X32"),offset=entry.Offset,bytes=wem.Length,
                        sha256=Convert.ToHexString(SHA256.HashData(wem)),file=mediaDest});
                }
                seen.Add(name);Console.WriteLine($"Indexed {name}, {found.Count}/{needed.Count} media found");continue;
            }
            byte[] bytes;
            try{bytes=loader.ExtractFileToBytes(block,chunk,file);}catch(FileNotFoundException){continue;}
            var md5=MD5.HashData(bytes);
            UInt128 hash=(UInt128)BinaryPrimitives.ReadUInt64LittleEndian(md5.AsSpan(8))<<64|BinaryPrimitives.ReadUInt64LittleEndian(md5);
            if(bytes.LongLength!=file.Length || (file.FileDataMd5!=0&&hash!=file.FileDataMd5))throw new InvalidDataException("Integrity check failed");
            seen.Add(name);
            var dest=Path.Combine(output,Path.GetFileName(name));File.WriteAllBytes(dest,bytes);
            rows.Add(new{layer,block=block.ToString(),name,info.Version,file=dest,bytes=bytes.Length,sha256=Convert.ToHexString(SHA256.HashData(bytes))});
            Console.WriteLine($"{layer}/{block}: {name} ({bytes.Length} bytes)");
        }
    }
}
File.WriteAllText(Path.Combine(output,args[0]+"_sources.json"),JsonConvert.SerializeObject(rows,Formatting.Indented));
Console.WriteLine($"{rows.Count} records");
if(args[0]=="media" && !needed.SetEquals(found))throw new InvalidDataException("Missing media: "+string.Join(",",needed.Except(found)));
