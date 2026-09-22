import * as THREE from 'three';
import { GhostRobot } from './Robot';

export class WIM {
    public group: THREE.Group;
    public miniRobot: GhostRobot;
    
    constructor() {
        this.group = new THREE.Group();
        
        // Base platform for the WIM
        const platformGeom = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 32);
        const platformMat = new THREE.MeshStandardMaterial({ 
            color: 0x444444, 
            transparent: true, 
            opacity: 0.8,
            wireframe: true
        });
        const platform = new THREE.Mesh(platformGeom, platformMat);
        this.group.add(platform);
        
        // Miniature robot
        this.miniRobot = new GhostRobot({ isPhantom: false });
        
        // Scale it down to be a "miniature"
        const miniGroup = this.miniRobot.getObject();
        miniGroup.scale.set(0.25, 0.25, 0.25);
        miniGroup.position.set(0, 0.025, 0); // Sit on platform
        
        this.group.add(miniGroup);
        
        // Position WIM in front of user's typical XR view
        this.group.position.set(0.5, 1.2, -0.4);
    }
    
    public updateJoints(joints: number[]) {
        this.miniRobot.updateJoints(joints);
    }
    
    public getObject() {
        return this.group;
    }

    public setVisibility(visible: boolean) {
        this.group.visible = visible;
    }
}
