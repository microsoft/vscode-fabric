/* eslint-disable security/detect-object-injection */
import { Mock, It, Times } from 'moq.ts';
import { TelemetryActivity, TelemetryEventRecord } from '@fabric/vscode-fabric-util';
 
export function verifyAddOrUpdateProperties<T extends TelemetryEventRecord>(
    telemetryActivity: Mock<TelemetryActivity<T>>,
    propertyName: string,
    expectedValue: any
): void {
    telemetryActivity.verify(
        t => t.addOrUpdateProperties(It.Is<any>(props =>
            propertyName in props && 
            props[propertyName] === expectedValue
        )),
        Times.AtLeastOnce()
    );
}

export function verifyAddOrUpdatePropertiesNever<T extends TelemetryEventRecord>(
    telemetryActivity: Mock<TelemetryActivity<T>>,
    propertyName: string
): void {
    telemetryActivity.verify(
        t => t.addOrUpdateProperties(It.Is<any>(props =>
            (propertyName in props)
        )),
        Times.Never()
    );
}

/* eslint-enable security/detect-object-injection */