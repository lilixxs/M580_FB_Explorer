import realClientXdb from '../../fixtures/ModbusTCP_Client.xdb?raw'

export interface DemoFile {
  label: string
  fileName: string
  xml: string
}

export const DEMO_XDB = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<FBExchangeFile><fileHeader company="Schneider Automation" product="Unity Pro XL V13.1 - 180823C" dateTime="date_and_time#2026-10-17-09:00:00" content="功能块源文件" DTDVersion="41"></fileHeader><contentHeader name="M580_FB_Explorer" version="0.0.1" dateTime="date_and_time#2026-10-17-09:00:00"></contentHeader><FBSource nameOfFBType="LGF_DemoMotor" version="1.30" dateTime="dt#2026-10-17-09:00:00"><comment>演示功能块：双命令启停与状态码输出</comment><attribute name="TypePassword" value=""></attribute><attribute name="TypeProtectionLevel" value="2#0000_0000"></attribute><attribute name="IsTypePasswordCrypted" value="FALSE"></attribute><inputParameters><variables name="xStart" typeName="BOOL"><comment>启动命令，上升沿有效</comment><attribute name="PositionPin" value="1"></attribute></variables><variables name="xStop" typeName="BOOL"><comment>停止命令，优先于启动</comment><attribute name="PositionPin" value="2"></attribute></variables><variables name="iSpeedRef" typeName="INT"><comment>速度给定，单位 rpm</comment><attribute name="PositionPin" value="3"></attribute></variables></inputParameters><outputParameters><variables name="xRun" typeName="BOOL"><comment>运行输出</comment><attribute name="PositionPin" value="1"></attribute></variables><variables name="iCode" typeName="INT"><comment>状态码，0 表示正常</comment><attribute name="PositionPin" value="2"></attribute></variables></outputParameters><publicLocalVariables><variables name="iState" typeName="INT"><comment>运行状态</comment><variableInit value="0"></variableInit></variables><variables name="iSpeedAct" typeName="INT"><comment>实际速度</comment><variableInit value="0"></variableInit></variables></publicLocalVariables><privateLocalVariables><variables name="tonRun" typeName="TON"><comment>运行确认延时</comment></variables><variables name="rtStart" typeName="R_TRIG"><comment>启动上升沿检测</comment></variables><variables name="iSpeedLimit" typeName="INT"><comment>速度上限</comment><variableInit value="1500"></variableInit></variables></privateLocalVariables><FBProgram name="LGF_DemoMotor"><STSource>
(* 每个扫描周期固定调用边沿检测实例 *)
rtStart(CLK := xStart);

IF xStop THEN
    (* 停止优先：立即复位运行状态 *)
    xRun := FALSE;
    iState := 0;
    iCode := 0;
ELSIF rtStart.Q THEN
    (* 启动：校验速度给定 *)
    IF (iSpeedRef &lt; 0) OR (iSpeedRef &gt; iSpeedLimit) THEN
        xRun := FALSE;
        iState := 0;
        iCode := -1;
    ELSE
        xRun := TRUE;
        iState := 10;
        iCode := 0;
    END_IF;
END_IF;

(* 运行确认：连续运行超过 2 秒才置运行反馈 *)
tonRun(IN := xRun, PT := t#2s);
IF tonRun.Q THEN
    iState := 20;
END_IF;

(* 实际速度跟随给定 *)
IF xRun THEN
    iSpeedAct := iSpeedRef;
ELSE
    iSpeedAct := 0;
END_IF;
</STSource></FBProgram></FBSource></FBExchangeFile>`

export const DEMO_XST = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<STExchangeFile><fileHeader company="Schneider Automation" product="Unity Pro XL V13.1 - 180823C" dateTime="date_and_time#2026-10-17-09:00:00" content="结构化的源文件" DTDVersion="41"></fileHeader><contentHeader name="M580_FB_Explorer" version="0.0.1" dateTime="date_and_time#2026-10-17-09:00:00"></contentHeader><program><identProgram name="Demo_Main" type="section" task="MAST"></identProgram><STSource>
(* 演示：功能块实例调用、边沿判定与三种循环 *)
tonScan(IN := xRun, PT := t#2s);
fbMotor(xStart := xStartCmd, xStop := xStopCmd, iSpeedRef := iSpeedRef,
        xRun => xMotorRun, iCode => iMotorCode);

IF xMotorRun AND tonScan.Q THEN
    iStep := iStep + 1;
ELSIF iMotorCode &lt;&gt; 0 THEN
    iFailCnt := iFailCnt + 1;
END_IF;

FOR iIndex := 0 TO 9 DO
    aiWordBuf[iIndex] := iIndex * 2;
END_FOR;

WHILE (iStep &gt; 0) AND (iStep &lt; 10) DO
    iStep := iStep + 1;
END_WHILE;
</STSource></program>
<program><identProgram name="Demo_Interlocks" type="section" task="MAST"></identProgram><FBD><network name="I1"><comment>非 ST 程序段：以只读原文方式展示与导出</comment></network></FBD></program>
<dataBlock>
<variables name="fbMotor" typeName="LGF_DemoMotor"><comment>演示功能块实例</comment></variables>
<variables name="tonScan" typeName="TON"><comment>扫描超时监视</comment></variables>
<variables name="xStartCmd" typeName="BOOL" topologicalAddress="%M10"><comment>启动命令</comment></variables>
<variables name="xStopCmd" typeName="BOOL" topologicalAddress="%M11"><comment>停止命令</comment></variables>
<variables name="iSpeedRef" typeName="INT" topologicalAddress="%MW100" defaultValue="1500"><comment>速度给定</comment></variables>
<variables name="xRun" typeName="BOOL" defaultValue="TRUE"><comment>运行标志</comment></variables>
<variables name="xMotorRun" typeName="BOOL"><comment>运行反馈</comment></variables>
<variables name="iMotorCode" typeName="INT" defaultValue="0"><comment>状态码</comment></variables>
<variables name="iStep" typeName="INT" defaultValue="0"><comment>步骤号</comment></variables>
<variables name="iFailCnt" typeName="INT" defaultValue="0"><comment>失败计数</comment></variables>
<variables name="iIndex" typeName="INT"><comment>循环下标</comment></variables>
<variables name="aiWordBuf" typeName="ARRAY[0..9] OF INT" topologicalAddress="%MW200"><comment>字缓冲区</comment></variables>
<variables name="iSpeedSet" typeName="DINT" topologicalAddress="%MW101" defaultValue="0"><comment>演示奇数地址导出自动对齐</comment></variables>
</dataBlock></STExchangeFile>`

export const DEMO_FILES: DemoFile[] = [
  { label: '示例功能块 .xdb', fileName: 'LGF_DemoMotor.xdb', xml: DEMO_XDB },
  { label: '示例程序段 .xst', fileName: 'Demo_Main.xst', xml: DEMO_XST },
  { label: '通讯功能块 .xdb', fileName: 'ModbusTCP_Client.xdb', xml: realClientXdb }
]
